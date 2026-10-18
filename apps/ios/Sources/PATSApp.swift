import SwiftUI

@main struct PATSApp: App {
    @UIApplicationDelegateAdaptor(PushDelegate.self) var push
    @StateObject private var store = AppStore()
    @Environment(\.scenePhase) private var phase
    @AppStorage("theme") private var theme = "system"
    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(store)
                .font(Theme.body()).foregroundStyle(Theme.text).tint(Theme.accent)
                .preferredColorScheme(theme == "dark" ? .dark : theme == "light" ? .light : nil)
                .environment(\.locale, Locale(identifier: store.locale))
                .onOpenURL { store.open($0) }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { if let url = $0.webpageURL { store.open(url) } }
                .task {
                    PushDelegate.route = { info in
                        let data = info["data"] as? [String: Any] ?? info as? [String: Any] ?? [:]
                        if let url = data["url"] as? String, let u = URL(string: url) { store.open(u) }
                        else if let id = data["eventId"] as? String { store.link = .event(id) }
                        else if let id = data["conversationId"] as? String { store.link = .conversation(id) }
                        else if let id = data["channelId"] as? String { store.link = .channel(id) }
                        else { store.link = .notifications }
                    }
                    await store.restore()
                }
                .onChange(of: phase) { _, value in if value == .active && store.signedIn { Task { await store.reload() } } }
        }
    }
}
struct RootView: View {
    @EnvironmentObject private var store: AppStore
    var body: some View {
        Group {
            if store.loading { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity).background(Theme.bg) }
            else if store.signedIn { MainShell() }
            else { NavigationStack { LoginView() } }
        }
        .sheet(item: $store.link) { link in
            NavigationStack {
                LinkDestination(link: link)
                    .toolbar { ToolbarItem(placement: .topBarTrailing) { Button(L.t("common.close")) { store.link = nil } } }
            }
        }
    }
}
struct LoginView: View {
    @EnvironmentObject private var store: AppStore
    @State private var email = ""
    @State private var code = ""
    @State private var otp: JSON = .null
    @State private var resendAt = Date.distantPast
    @State private var busy = false
    @State private var error: String?
    var body: some View {
        Page(title: "app.loginTitle") {
            HStack {
                Image("Crest").resizable().scaledToFit().frame(width: 72, height: 72).accessibilityLabel("PATS University")
                Spacer()
                Button(store.locale == "id" ? "English" : "Bahasa Indonesia") { store.setLocale(store.locale == "id" ? "en" : "id") }.buttonStyle(.bordered)
            }
            Text(L.t(otp.exists ? "otp.title" : "app.loginTitle")).font(Theme.title(32)).padding(.top, 32)
            Text(L.t(otp.exists ? "otp.subtitle" : "app.loginSubtitle", ["email": email])).foregroundStyle(Theme.muted)
            if let error { Notice(text: error, error: true) }
            if otp.exists {
                if !otp["demoCode"].text.isEmpty { Notice(text: L.t("otp.demoCode", ["code": otp["demoCode"].text])) }
                TextField(L.t("otp.codeLabel"), text: $code).textContentType(.oneTimeCode).keyboardType(.numberPad)
                    .font(.system(size: 32, weight: .semibold, design: .monospaced)).padding().background(Theme.surface, in: RoundedRectangle(cornerRadius: 12))
                    .onChange(of: code) { _, value in
                        code = String(value.filter(\.isNumber).prefix(6))
                        if code.count == 6 && !busy { Task { await verify() } }
                    }
                Button(L.t("otp.verify")) { Task { await verify() } }.buttonStyle(PATSButtonStyle()).disabled(busy || code.count != 6)
                TimelineView(.periodic(from: .now, by: 1)) { time in
                    let remaining = max(0, Int(ceil(resendAt.timeIntervalSince(time.date))))
                    Button(remaining > 0 ? L.t("otp.resendIn", ["seconds": String(remaining)]) : L.t("otp.resend")) { Task { await request() } }.disabled(busy || remaining > 0)
                }
                Button(L.t("common.back")) { otp = .null; code = ""; error = nil }
            } else {
                Field(key: "auth.emailLabel", value: $email, keyboard: .emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                Button(L.t("auth.sendCode")) { Task { await request() } }.buttonStyle(PATSButtonStyle()).disabled(busy)
                Link(L.t("auth.joinLink"), destination: Config.production.appendingPathComponent("join"))
            }
            if busy { ProgressView().frame(maxWidth: .infinity) }
        }
    }
    private func request() async {
        guard !busy else { return }
        guard email.contains("@"), email.contains(".") else { error = L.t("validation.emailInvalid"); return }
        busy = true; error = nil; defer { busy = false }
        do {
            otp = try await APIClient.shared.call("POST", "/api/auth/otp/request", .object(["email": .str(email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()), "locale": .str(store.locale), "audience": .str("app")]), auth: false)
            resendAt = Date().addingTimeInterval(Double(otp["resendAfter"].int)); code = ""
        } catch { self.error = error.localizedDescription
            if let e = error as? APIError, let seconds = e.params["seconds"]?.int { resendAt = Date().addingTimeInterval(Double(seconds)) }
        }
    }
    private func verify() async {
        guard !busy, code.count == 6 else { return }
        busy = true; error = nil; defer { busy = false }
        do {
            let result = try await APIClient.shared.call("POST", "/api/auth/otp/verify", .object(["email": .str(email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()), "code": .str(code), "client": .str("app")]), auth: false)
            try await store.login(result)
        } catch { self.error = error.localizedDescription }
    }
}
struct MainShell: View {
    @EnvironmentObject private var store: AppStore
    var body: some View {
        TabView {
            NavigationStack { Page(title: "app.tabHub") { EmptyState() } }.tabItem { Label(L.t("app.tabHub"), systemImage: "square.grid.2x2") }
            NavigationStack { ProfileView() }.tabItem { Label(L.t("native.profile"), systemImage: "person.crop.circle") }
        }
    }
}
struct ProfileView: View {
    @EnvironmentObject private var store: AppStore
    @AppStorage("theme") private var theme = "system"
    @State private var logout = false
    var body: some View {
        Page(title: "native.profile") {
            if store.offline { Notice(text: L.t("native.offline")) }
            Panel {
                Text(store.user["name"].text).font(Theme.title())
                Text(store.user["email"].text).foregroundStyle(Theme.muted)
                Text(store.member["nim"].text).monospacedDigit()
                Badge(value: store.user["role"].text)
            }
            Picker(L.t("common.language"), selection: Binding(get: { store.locale }, set: { value in
                store.setLocale(value)
                Task { _ = try? await APIClient.shared.call("PATCH", "/api/me", .object(["locale": .str(value)])) }
            })) { Text("Bahasa Indonesia").tag("id"); Text("English").tag("en") }.pickerStyle(.segmented)
            Picker(L.t("native.theme"), selection: $theme) {
                Text(L.t("native.system")).tag("system"); Text(L.t("native.light")).tag("light"); Text(L.t("native.dark")).tag("dark")
            }.pickerStyle(.segmented)
            Button(L.t("auth.logout"), role: .destructive) { logout = true }.frame(minHeight: 44)
        }
        .refreshable { await store.reload() }
        .alert(L.t("auth.logout"), isPresented: $logout) {
            Button(L.t("common.cancel"), role: .cancel) {}
            Button(L.t("auth.logout"), role: .destructive) { Task { await store.signOut() } }
        }
    }
}
struct LinkDestination: View {
    var link: AppLink
    var body: some View {
        switch link {
        case .card(let token): PublicCardView(token: token)
        default: Page(title: "app.tabHub") { EmptyState() }
        }
    }
}
struct PublicCardView: View {
    let token: String
    @StateObject private var resource = Resource()
    var body: some View {
        Page(title: "app.tabCard") {
            ResourceState(resource: resource) { await load() }
            if resource.data.exists {
                Badge(value: resource.data["state"].text)
                if resource.data["member"].exists {
                    Panel {
                        Text(resource.data["member"]["fullName"].text).font(Theme.title())
                        Text(resource.data["member"]["nim"].text).monospacedDigit()
                        Text(resource.data["member"]["city"].text)
                        Text(resource.data["member"]["favoriteSong"].text)
                        Text(resource.data["member"]["quotes"].text)
                    }
                }
            }
        }.task { await load() }.refreshable { await load() }
    }
    private func load() async { await resource.load("/api/c/\(token)", auth: await APIClient.shared.signedIn) }
}
