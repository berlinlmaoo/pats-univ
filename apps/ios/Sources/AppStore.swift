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
    var user: JSON { me["user"] }
    var member: JSON { me["member"] }
    var admin: Bool { user["capabilities"].rows.contains { $0.text == "checkin.scan" } }
    func can(_ capability: String) -> Bool { user["capabilities"].rows.contains { $0.text == capability } }
    func restore() async {
        me = await APIClient.shared.cachedMe; signedIn = await APIClient.shared.signedIn
        if signedIn { await reload() }; loading = false
    }
    func synchronize() async {
        let snapshot = await APIClient.shared.snapshot()
        signedIn = snapshot.exists; me = snapshot["me"]
        if !signedIn { offline = false; link = nil }
    }
    func login(_ result: JSON) async throws {
        try await APIClient.shared.install(result); me = result["me"]; signedIn = true; offline = false
        setLocale(user["locale"].text)
    }
    func reload() async {
        do { me = try await APIClient.shared.refreshMe(); signedIn = true; offline = false }
        catch { offline = true; signedIn = await APIClient.shared.signedIn; if !signedIn { me = .null; link = nil } }
    }
    func signOut() async { await APIClient.shared.logout(); me = .null; signedIn = false; offline = false; link = nil }
    func setLocale(_ value: String) { locale = value == "en" ? "en" : "id"; UserDefaults.standard.set(locale, forKey: "locale") }
    func open(_ url: URL) { if let token = CardLink.token(url.absoluteString) { link = .card(token) } }
}
enum AppLink: Identifiable {
    case card(String), event(String), channel(String), conversation(String), notifications
    var id: String {
        switch self { case .card(let s): return "card:" + s; case .event(let s): return "event:" + s; case .channel(let s): return "channel:" + s; case .conversation(let s): return "conversation:" + s; case .notifications: return "notifications" }
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
