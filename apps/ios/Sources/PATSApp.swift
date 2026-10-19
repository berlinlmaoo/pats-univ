import SwiftUI

@main struct PATSApp: App {
    @UIApplicationDelegateAdaptor(PushDelegate.self) var push
    @StateObject private var store = AppStore()
    @Environment(\.scenePhase) private var phase
    @AppStorage("theme") private var theme = "system"
    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(store)
                .dynamicTypeSize(.xSmall ... .xxxLarge)
                .buttonStyle(PATSButtonStyle(variant: .secondary))
                .font(Theme.body()).foregroundStyle(Theme.text).tint(Theme.accent)
                .preferredColorScheme(theme == "dark" ? .dark : theme == "light" ? .light : nil)
                .environment(\.locale, Locale(identifier: store.locale))
                .onReceive(NotificationCenter.default.publisher(for: .patsSessionChanged).receive(on: RunLoop.main)) { _ in Task { await store.synchronize() } }
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
            if store.loading { Skeleton().padding().frame(maxWidth: .infinity, maxHeight: .infinity).background(Theme.bg) }
            else if store.signedIn { MainShell().id(store.user.id) }
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
    @AppStorage("server") private var server = "development"
    var body: some View {
        Page(title: otp.exists ? "otp.title" : "auth.signInHeading") {
            VStack(spacing: Theme.padding) {
                HStack {
                    Image("Crest").resizable().scaledToFit().frame(width: 72, height: 72).accessibilityLabel("PATS University")
                    Spacer()
                    Button(store.locale == "id" ? "EN" : "ID") { store.setLocale(store.locale == "id" ? "en" : "id") }
                        .buttonStyle(.plain).font(Theme.label).frame(minWidth: 44, minHeight: 44)
                        .background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: Theme.controlRadius))
                }
                Image("BrandLockup").resizable().scaledToFit().frame(height: 88).accessibilityHidden(true)
            }.padding(Theme.padding).foregroundStyle(Theme.color("bandText")).background(Theme.color("band"))
                .overlay(alignment: .bottom) { Theme.color("gold").frame(height: 3) }
            Text(L.t(otp.exists ? "otp.subtitle" : "app.loginSubtitle", ["email": email])).foregroundStyle(Theme.muted)
            if let error { Notice(text: error, error: true) }
            if otp.exists {
                if !otp["demoCode"].text.isEmpty { Notice(text: L.t("otp.demoCode", ["code": otp["demoCode"].text])) }
                TextField(L.t("otp.codeLabel"), text: $code).textContentType(.oneTimeCode).keyboardType(.numberPad)
                    .font(Theme.title(32)).monospacedDigit().padding().background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.controlRadius))
                    .onChange(of: code) { _, value in
                        code = String(value.filter(\.isNumber).prefix(6))
                        if code.count == 6 && !busy { Task { await verify() } }
                    }
                Button(L.t("otp.verify")) { Task { await verify() } }.buttonStyle(PATSButtonStyle(loading: busy)).disabled(busy || code.count != 6)
                TimelineView(.periodic(from: .now, by: 1)) { time in
                    let remaining = max(0, Int(ceil(resendAt.timeIntervalSince(time.date))))
                    Button(remaining > 0 ? L.t("otp.resendIn", ["seconds": String(remaining)]) : L.t("otp.resend")) { Task { await request() } }.disabled(busy || remaining > 0)
                }
                Button(L.t("common.back")) { otp = .null; code = ""; error = nil }
            } else {
                Field(key: "auth.emailLabel", value: $email, keyboard: .emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                Button(L.t("auth.sendCode")) { Task { await request() } }.buttonStyle(PATSButtonStyle(loading: busy)).disabled(busy)
                Link(L.t("auth.joinLink"), destination: Config.url("/join"))
            }
            #if PATS_DEV_SERVER
            Tabs(options: [("development", "native.development"), ("production", "native.production")], selection: $server).disabled(busy)
                .onChange(of: server) { _, _ in otp = .null; code = ""; error = nil; Task { await APIClient.shared.clear() } }
            #endif
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
    @StateObject private var claims = Resource()
    @Environment(\.scenePhase) private var phase
    private var items: [(String, String, String)] {
        store.admin ? [("tools", "app.tabAdmin", "square.grid.2x2"), ("profile", "native.profile", "person.crop.circle")] :
            [("home", "ktm.home", "house"), ("events", "app.tabEvents", "calendar"), ("card", "ktm.title", "person.text.rectangle"), ("hub", "app.tabHub", "bubble.left.and.bubble.right"), ("profile", "native.profile", "person.crop.circle")]
    }
    var body: some View {
        TabView(selection: $store.tab) {
            if store.admin { NavigationStack { AdminToolsView() }.tag("tools") }
            else {
                NavigationStack { MemberHomeView() }.tag("home")
                NavigationStack { EventsView() }.tag("events")
                NavigationStack { MemberCardView() }.tag("card")
                NavigationStack { SocialHubView() }.tag("hub")
            }
            NavigationStack { ProfileView() }.tag("profile")
        }.toolbar(.hidden, for: .tabBar)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                HStack(alignment: .top, spacing: 0) {
                    ForEach(items, id: \.0) { value, key, icon in
                        Button { store.tab = value } label: {
                            VStack(spacing: 4) {
                                Rectangle().fill(store.tab == value ? Theme.color("gold") : Color.clear).frame(height: 3)
                                ZStack(alignment: .topTrailing) {
                                    Image(systemName: icon).font(.system(size: 20)).frame(width: 40, height: 30)
                                        .background(value == "card" ? Theme.color("secondary") : .clear, in: RoundedRectangle(cornerRadius: Theme.controlRadius))
                                    if value == "tools", pending > 0 { CountChip(count: pending).offset(x: 10, y: -4) }
                                }
                                Text(L.t(key).uppercased()).font(Theme.body(11).weight(.bold)).tracking(0.44).lineLimit(1).minimumScaleFactor(0.7)
                            }.padding(.bottom, 8).frame(maxWidth: .infinity, minHeight: 60)
                                .foregroundStyle(Theme.color(store.tab == value ? "bandText" : "bandMuted"))
                        }.buttonStyle(.plain).accessibilityLabel(L.t(key)).accessibilityAddTraits(store.tab == value ? .isSelected : [])
                    }
                }.background(Theme.color("band").ignoresSafeArea(edges: .bottom))
            }
            .onAppear { if store.admin && store.tab == "home" { store.tab = "tools" } }
            .task {
                guard store.can("promoter.manage") else { return }
                while !Task.isCancelled {
                    if phase == .active { await claims.load("/api/admin/loyalty/claims") }
                    do { try await Task.sleep(for: .seconds(30)) } catch { break }
                }
            }
    }
    private var pending: Int { claims.data["claims"].rows.filter { $0["status"].text == "PENDING" }.count }
}
struct MemberHomeView: View {
    @EnvironmentObject private var store: AppStore
    var body: some View {
        DataPage(title: "ktm.home", path: "/api/events") { data, _ in
            if store.offline { Notice(text: L.t("native.offline")) }
            if let event = data["upcoming"].rows.first {
                NavigationLink { EventDetailView(eventID: event.id) } label: { EventPanel(event: event) }.buttonStyle(.plain)
            } else { EmptyState(title: "app.eventsEmptyTitle", message: "native.emptyBody", icon: "calendar") }
            ProfileXPView(memberID: store.member.id)
            Button(L.t("ktm.show")) { store.tab = "card" }.buttonStyle(PATSButtonStyle(variant: .maroon))
            Panel {
                CardHeading(key: "loyalty.title")
                NavigationRow(title: "app.tabRewards", icon: "gift") { WalletView() }
                NavigationRow(title: "app.notificationsTitle", icon: "bell") { NotificationsView() }
            }
        }
    }
}
struct ProfileView: View {
    @EnvironmentObject private var store: AppStore
    @AppStorage("theme") private var theme = "system"
    @State private var logout = false
    @State private var leaveError: String?
    @StateObject private var preference = Mutation()
    var body: some View {
        Page(title: "native.profile") {
            if store.offline { Notice(text: L.t("native.offline")) }
            if store.member.exists { PhotoEditor() }
            Panel {
                Text(store.user["name"].text).font(Theme.title())
                Text(store.user["email"].text).foregroundStyle(Theme.muted)
                Text(store.member["nim"].text).monospacedDigit()
                Text(store.user["phone"].text).foregroundStyle(Theme.muted)
                Text(store.member.exists ? store.member["city"]["name"].text : store.user["city"]["name"].text)
                if store.member.exists {
                    DetailRow(key: "join.favoriteDrink", value: store.member["favoriteDrink"].text)
                    Text(L.t("app.song") + ": " + store.member["favoriteSong"].text)
                    Text(L.t("app.genre") + ": " + store.member["favoriteGenre"].text)
                    Text(store.member["quotes"].text).italic()
                    if store.member["isPromoter"].bool { Badge(value: "PR") }
                }
                Badge(value: store.user["role"].text)
            }
            if store.member.exists {
                Button { store.tab = "card" } label: { KTMCard(member: store.member, interactive: false) }.buttonStyle(.plain).accessibilityLabel(L.t("ktm.show"))
                NavigationRow(title: "ktm.editProfile", icon: "pencil") { ProfileEditor(member: store.member) }
                ProfileXPView(memberID: store.member.id)
                NavigationRow(title: "app.tabRewards", icon: "gift") { WalletView() }
            }
            MutationState(mutation: preference)
            SectionLabel(key: "common.language")
            Tabs(options: [("id", "Bahasa Indonesia"), ("en", "English")], selection: Binding(get: { store.locale }, set: { value in
                store.setLocale(value)
                Task { await preference.send("/api/me", body: .object(["locale": .str(value)]), method: "PATCH", after: { await store.reload() }) }
            }))
            SectionLabel(key: "native.theme")
            Tabs(options: [("system", "native.system"), ("light", "native.light"), ("dark", "native.dark")], selection: $theme)
            Panel {
                NavigationRow(title: "app.notificationsTitle", icon: "bell") { NotificationsView() }
                if store.member.exists {
                    NavigationRow(title: "app.historyTitle", icon: "clock") { HistoryView() }
                    NavigationRow(title: "phase5.claimTitle", icon: "doc.text") { ClaimsView() }
                    NavigationRow(title: "phase5.regionChange", icon: "globe.asia.australia") { RegionChangeView() }
                    NavigationRow(title: "social.reservations", icon: "list.bullet") { SocialOperationsView() }
                    ConfirmAction(label: "phase5.leave", message: L.t("phase5.leaveConfirm"), destructive: true) {
                        do { _ = try await APIClient.shared.call("POST", "/api/me/leave", .object([:])); await store.signOut() }
                        catch { leaveError = error.localizedDescription }
                    }
                    if let leaveError { Notice(text: leaveError, error: true) }
                }
            }
            Button(L.t("common.signOut"), role: .destructive) { logout = true }.frame(minHeight: 44)
        }
        .refreshable { await store.reload() }
        .alert(L.t("common.signOut"), isPresented: $logout) {
            Button(L.t("common.cancel"), role: .cancel) {}
            Button(L.t("common.signOut"), role: .destructive) { Task { await store.signOut() } }
        }
    }
}
struct LinkDestination: View {
    var link: AppLink
    @EnvironmentObject private var store: AppStore
    var body: some View {
        switch link {
        case .card(let token): PublicCardView(token: token)
        case .event(let id): EventDetailView(eventID: id, admin: store.admin)
        case .channel(let id): ChannelView(room: Room(kind: "channel", id: id))
        case .conversation(let id): ChannelView(room: Room(kind: "conversation", id: id))
        case .notifications: NotificationsView()
        }
    }
}
struct PublicCardView: View {
    let token: String
    @EnvironmentObject private var store: AppStore
    @StateObject private var resource = Resource()
    var body: some View {
        Page(title: "app.tabCard") {
            ResourceState(resource: resource) { await load() }
            if resource.data.exists {
                Badge(value: resource.data["state"].text)
                if resource.data["state"].text == "revoked" { Notice(text: L.t("cardPage.revokedBody")) }
                if resource.data["state"].text == "inactive" { Notice(text: L.t("cardPage.inactiveBody")) }
                if resource.data["member"].exists {
                    let member = resource.data["member"]
                    KTMCard(member: member, token: Config.url("/c/\(token)").absoluteString)
                    HStack(alignment: .top) {
                        MemberPhoto(url: member["photoUrl"].text)
                        VStack(alignment: .leading, spacing: Theme.gap) {
                            DetailRow(key: "app.city", value: member["city"].text)
                            DetailRow(key: "ktm.memberSince", value: L.date(member["joinedAt"].text))
                        }
                    }
                }
                if resource.data["isMine"].bool && store.member.exists { NavigationRow(title: "app.cardLinkOpen", icon: "person.text.rectangle") { MemberCardView() } }
            }
        }.task { await load() }.refreshable { await load() }
    }
    private func load() async { await resource.load("/api/c/\(token)", auth: await APIClient.shared.signedIn) }
}
