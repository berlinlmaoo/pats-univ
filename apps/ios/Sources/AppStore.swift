import SwiftUI
import UserNotifications

@MainActor final class AppStore: ObservableObject {
    @Published var me: JSON = .null
    @Published var loading = true
    @Published var offline = false
    @Published var signedIn = false
    @Published var link: AppLink?
    @Published var locale = L.locale
    @Published var tab = "home"
    @Published var navigationRevision = UUID()
    @Published var showWelcome = false
    @Published var operationInProgress = false {
        didSet {
            if oldValue && !operationInProgress { drainRoutes() }
        }
    }
    @Published var cardEvent: JSON = .null
    @Published var cardEventID = ""
    @Published private var presentedAdminMode = false
    var adminMode: Bool {
        get { presentedAdminMode }
        set {
            guard !operationInProgress || !admin || !signedIn else { return }
            let accepted = newValue && admin && signedIn
            guard presentedAdminMode != accepted else { return }
            presentedAdminMode = accepted
            preferences.save(accepted, owner: owner, authorized: admin)
            navigationRevision = UUID()
        }
    }
    private let preferences = AdminModePreferences()
    private var identity = ""
    private var deferredURL: URL?
    private var deferredNotification: JSON?
    var user: JSON { me["user"] }
    var member: JSON { me["member"] }
    var admin: Bool {
        if user.object.keys.contains("adminScope") { return user["adminScope"].exists }
        return can("checkin.scan") || can("dashboard.access")
    }
    var managing: Bool { admin && adminMode }
    var scope: String { user["adminScope"]["kind"].text == "HQ" || can("hq.manage") ? L.t("ux.mode.allCities") : (user["adminScope"]["city"]["name"].text.isEmpty ? user["city"]["name"].text : user["adminScope"]["city"]["name"].text) }
    private var owner: String { AdminModePreferences.owner(origin: Config.baseURL.absoluteString, userID: user.id) }
    private var welcomeKey: String { "pats.ux.welcome." + owner }
    func can(_ capability: String) -> Bool { user["capabilities"].rows.contains { $0.text == capability } }
    func restore() async {
        me = await APIClient.shared.cachedMe; signedIn = await APIClient.shared.signedIn
        if signedIn { activateIdentity(fresh: false); await reload() }
        loading = false; drainRoutes()
    }
    func synchronize() async {
        let snapshot = await APIClient.shared.snapshot()
        signedIn = snapshot.exists; me = snapshot["me"]
        if signedIn { activateIdentity(fresh: false) } else { clearPresentation() }
    }
    func login(_ result: JSON) async throws {
        try await APIClient.shared.install(result); me = result["me"]; signedIn = true; offline = false
        activateIdentity(fresh: true); setLocale(user["locale"].text)
    }
    func reload() async {
        do { me = try await APIClient.shared.refreshMe(); signedIn = true; offline = false; activateIdentity(fresh: false) }
        catch { offline = true; signedIn = await APIClient.shared.signedIn; if !signedIn { me = .null; clearPresentation() } }
    }
    func signOut() async {
        guard !operationInProgress else { return }
        await APIClient.shared.logout(); me = .null; signedIn = false; offline = false; clearPresentation()
    }
    private func activateIdentity(fresh: Bool) {
        let changed = identity != owner
        if changed || fresh { tab = "home"; link = nil; cardEvent = .null; cardEventID = ""; navigationRevision = UUID() }
        identity = owner
        adminMode = preferences.activate(owner: owner, fresh: fresh, authorized: admin)
        showWelcome = !UserDefaults.standard.bool(forKey: welcomeKey)
        drainRoutes()
    }
    private func clearPresentation() {
        deferredURL = nil; deferredNotification = nil
        operationInProgress = false; preferences.reset(); adminMode = false; identity = ""
        link = nil; tab = "home"; cardEvent = .null; cardEventID = ""; showWelcome = false; navigationRevision = UUID()
    }
    func completeWelcome() { UserDefaults.standard.set(true, forKey: welcomeKey); showWelcome = false; drainRoutes() }
    func setLocale(_ value: String) { locale = value == "en" ? "en" : "id"; UserDefaults.standard.set(locale, forKey: "locale") }
    func selectCard(event: JSON) { guard !operationInProgress else { return }; cardEvent = event; cardEventID = event.id; link = nil; tab = "card" }
    private func drainRoutes() {
        guard !loading, !showWelcome, !operationInProgress else { return }
        if let url = deferredURL { deferredURL = nil; _ = open(url) }
        else if signedIn, let data = deferredNotification { deferredNotification = nil; routeNotification(data) }
    }
    @discardableResult func open(_ url: URL) -> Bool {
        guard !operationInProgress, !loading, !showWelcome else { deferredURL = url; deferredNotification = nil; return true }
        if let token = CardLink.token(url.absoluteString) { link = .card(token); return true }
        guard [Config.baseURL.host, Config.production.host].contains(url.host) else { return false }
        let parts = url.pathComponents.filter { $0 != "/" }
        if parts.first == "events", parts.count > 1 {
            guard signedIn else { deferredURL = url; return true }
            link = .event(parts[1]); return true
        }
        if parts.first == "notifications" {
            guard signedIn else { deferredURL = url; return true }
            link = .notifications; return true
        }
        return false
    }
    func routeNotification(_ data: JSON) {
        guard !operationInProgress, !loading, signedIn, !showWelcome else { deferredNotification = data; deferredURL = nil; return }
        let target = UXNotificationTarget.resolve(data)
        if target == .notifications, let url = URL(string: data["url"].text), !data["url"].text.isEmpty, open(url) { return }
        if !data["notificationId"].text.isEmpty {
            let id = data["notificationId"].text
            Task { _ = try? await APIClient.shared.call("POST", "/api/me/notifications/\(id)/read", .object([:])) }
        }
        switch target {
        case .task(let payload):
            if payload["screen"].text == "card" { cardEvent = .null; cardEventID = ""; tab = "card"; link = nil }
            else if payload["screen"].text == "hub" && payload["channelId"].text.isEmpty && !payload["requiresAdminMode"].bool { tab = "hub"; link = nil }
            else { link = .task(payload) }
        case .personalCard: cardEvent = .null; cardEventID = ""; tab = "card"; link = nil
        case .event(let id): link = .event(id)
        case .claims(let id): link = admin && !member.exists ? .claimReview(id) : .claims(id)
        case .claimReview(let id): link = .claimReview(id)
        case .cardRequest(let id): link = .cardRequest(id)
        case .payments(let id): link = .payments(id)
        case .recap(let id): link = .recap(id)
        case .scan(let id): link = .scan(id)
        case .channel(let id): link = .channel(id)
        case .conversation(let id): link = .conversation(id)
        case .community: tab = "hub"; link = nil
        case .requests(let id): link = .requests(id)
        case .adminRequests(let id): link = .adminRequests(id)
        case .roaming(let id): link = .roaming(id)
        case .regionChange: link = .regionChange
        case .wallet: link = .wallet
        case .notifications: link = .notifications
        }
    }
}
enum AppLink: Identifiable {
    case card(String), event(String), channel(String), conversation(String), claims(String), claimReview(String)
    case task(JSON), personalReservation(String, String), dashboard(String, String)
    case cardRequest(String), payments(String), recap(String), scan(String), requests(String), adminRequests(String), roaming(String), regionChange, wallet, notifications
    var id: String {
        switch self {
        case .dashboard(let path, _): return "dashboard:" + path
        case .task(let p): return "task:" + ["screen", "eventId", "proofId", "reservationId", "claimId", "memberId", "requestId", "conversationId", "channelId", "onlyDue"].map { p[$0].text }.joined(separator: ":")
        case .personalReservation(let event, let reservation): return "personalReservation:" + event + ":" + reservation
        case .card(let s): return "card:" + s
        case .event(let s): return "event:" + s
        case .channel(let s): return "channel:" + s
        case .conversation(let s): return "conversation:" + s
        case .claims(let s): return "claims:" + s
        case .claimReview(let s): return "claimReview:" + s
        case .cardRequest(let s): return "cardRequest:" + s
        case .payments(let s): return "payments:" + s
        case .recap(let s): return "recap:" + s
        case .scan(let s): return "scan:" + s
        case .requests(let s): return "requests:" + s
        case .adminRequests(let s): return "adminRequests:" + s
        case .roaming(let s): return "roaming:" + s
        case .regionChange: return "regionChange"
        case .wallet: return "wallet"
        case .notifications: return "notifications"
        }
    }
}

@MainActor final class Resource: ObservableObject {
    @Published var data: JSON = .null
    @Published var loading = false
    @Published var error: String?
    @Published var failureCode: String?
    private(set) var requestedAt = Date()
    private(set) var receivedAt = Date()
    private var requestID = 0
    func load(_ path: String, auth: Bool = true) async {
        requestID += 1; let id = requestID
        loading = true; error = nil; failureCode = nil; requestedAt = Date()
        do {
            let result = try await APIClient.shared.call("GET", path, auth: auth)
            guard id == requestID, !Task.isCancelled else { return }
            data = result; receivedAt = Date(); loading = false
        } catch {
            guard id == requestID else { return }
            if !Task.isCancelled {
                self.error = error.localizedDescription; failureCode = (error as? APIError)?.code
                if ["FORBIDDEN", "UNAUTHENTICATED", "ACCOUNT_DISABLED"].contains(failureCode ?? "") { data = .null }
            }
            loading = false
        }
    }
}
struct ResourceState: View {
    @ObservedObject var resource: Resource
    var retry: () async -> Void
    var body: some View {
        if resource.loading && !resource.data.exists { Skeleton() }
        if let error = resource.error { EmptyState(title: "ktm.loadFailed", message: error, icon: "exclamationmark.circle"); Button(L.t("common.retry")) { Task { await retry() } }.buttonStyle(PATSButtonStyle(variant: .secondary)) }
    }
}

/// APNs registration is native; the current backend only accepts Expo tokens.
/// Do not submit an APNs token as though it were an Expo token.
final class PushDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    static var route: (([AnyHashable: Any]) -> Void)?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self; return true
    }
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        // Memory only until the backend has an APNs registration contract. Never log the token.
        PushRegistration.token = deviceToken
    }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) { PushRegistration.token = nil }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        await MainActor.run { Self.route?(response.notification.request.content.userInfo) }
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions { [.banner, .sound, .badge] }
}
enum PushRegistration {
    static var token: Data?
    @MainActor static func request() async {
        if (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) == true { UIApplication.shared.registerForRemoteNotifications() }
    }
}
