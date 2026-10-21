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
                        if let encoded = try? JSONSerialization.data(withJSONObject: data), let payload = try? JSON.parse(encoded) { store.routeNotification(payload) }
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
            else if store.signedIn && store.showWelcome { NavigationStack { WelcomeView() } }
            else if store.signedIn { MainShell().id(store.user.id) }
            else { NavigationStack { LoginView() } }
        }
        .sheet(item: $store.link) { link in
            NavigationStack {
                LinkDestination(link: link)
                    .toolbar { ToolbarItem(placement: .topBarTrailing) { Button(L.t("common.close")) { store.link = nil }.disabled(store.operationInProgress) } }
            }.safeAreaInset(edge: .bottom, spacing: 0) { if store.managing { AdminScopeBanner() } }.interactiveDismissDisabled(store.operationInProgress)
        }
    }
}
struct LoginView: View {
    @EnvironmentObject private var store: AppStore
    @State private var email = ""
    @State private var code = ""
    @State private var otp: JSON = .null
    @State private var resendAt = Date.distantPast
    @State private var expiresAt = Date.distantPast
    @State private var busy = false
    @State private var error: String?
    @State private var sentAgain = false
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
            Text(L.t(otp.exists ? "ux.otp.sentTo" : "app.loginSubtitle", ["email": email])).foregroundStyle(Theme.muted)
            if let error { Notice(text: error, error: true) }
            if otp.exists {
                if sentAgain { Notice(text: L.t("ux.otp.resent")) }
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
                    if expiresAt > .distantPast { Text(L.t("ux.otp.expiresIn", ["seconds": L.count(max(0, Int(ceil(expiresAt.timeIntervalSince(time.date)))))] )).font(Theme.body(13)).foregroundStyle(Theme.muted) }
                    Button(remaining > 0 ? L.t("otp.resendIn", ["seconds": String(remaining)]) : L.t("otp.resend")) { Task { await request() } }.disabled(busy || remaining > 0)
                }
                Button(L.t("ux.otp.changeEmail")) { otp = .null; code = ""; error = nil; sentAgain = false }.disabled(busy)
            } else {
                Field(key: "auth.emailLabel", value: $email, keyboard: .emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                TimelineView(.periodic(from: .now, by: 1)) { time in
                    let remaining = max(0, Int(ceil(resendAt.timeIntervalSince(time.date))))
                    Button(remaining > 0 ? L.t("otp.resendIn", ["seconds": L.count(remaining)]) : L.t("auth.sendCode")) { Task { await request() } }.buttonStyle(PATSButtonStyle(loading: busy)).disabled(busy || remaining > 0)
                }
                Link(L.t("auth.joinLink"), destination: Config.url("/join"))
            }
            #if PATS_DEV_SERVER
            Tabs(options: [("development", "native.development"), ("production", "native.production")], selection: $server).disabled(busy)
                .onChange(of: server) { _, _ in otp = .null; code = ""; error = nil; resendAt = .distantPast; Task { await APIClient.shared.clear() } }
            #endif
        }
    }
    private func request() async {
        guard !busy, resendAt <= .now else { return }
        guard email.contains("@"), email.contains(".") else { error = L.t("validation.emailInvalid"); return }
        busy = true; error = nil; let resend = otp.exists; defer { busy = false }
        do {
            otp = try await APIClient.shared.call("POST", "/api/auth/otp/request", .object(["email": .str(email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()), "locale": .str(store.locale), "audience": .str("app")]), auth: false)
            resendAt = Date().addingTimeInterval(Double(otp["resendAfter"].int)); code = ""; sentAgain = resend
            expiresAt = Dates.parse(otp["expiresAt"].text) ?? .distantPast
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
struct WelcomeView: View {
    @EnvironmentObject private var store: AppStore
    var body: some View {
        Page(title: "ux.welcome.title") {
            Image("Crest").resizable().scaledToFit().frame(height: 90).frame(maxWidth: .infinity).accessibilityHidden(true)
            Text(L.t("ux.welcome.body")).font(Theme.title(22))
            Panel {
                Label(L.t("ux.welcome.home"), systemImage: "house")
                Label(L.t("ux.welcome.events"), systemImage: "calendar")
                Label(L.t("ux.welcome.card"), systemImage: "person.text.rectangle")
                Label(L.t("ux.welcome.community"), systemImage: "bubble.left.and.bubble.right")
                Label(L.t("ux.welcome.account"), systemImage: "person.crop.circle")
            }
            if store.member.exists { Notice(text: L.t("ux.welcome.member", ["city": store.member["city"]["name"].text])) }
            if store.admin { Notice(text: L.t("ux.welcome.staff")) }
            if store.member.exists && store.member["photoUrl"].text.isEmpty { NavigationRow(title: "ux.welcome.addPhoto", subtitle: L.t("ux.welcome.photoOptional"), icon: "camera") { Page(title: "ux.welcome.addPhoto") { PhotoEditor() } } }
            Button(L.t("ux.welcome.start")) { store.completeWelcome() }.buttonStyle(PATSButtonStyle(variant: .maroon))
        }
    }
}
struct MainShell: View {
    @EnvironmentObject private var store: AppStore
    private let items = [("home", "ux.tab.home", "house"), ("events", "ux.tab.events", "calendar"), ("card", "ux.tab.card", "person.text.rectangle"), ("hub", "ux.tab.community", "bubble.left.and.bubble.right"), ("profile", "ux.tab.account", "person.crop.circle")]
    var body: some View {
        TabView(selection: $store.tab) {
            NavigationStack { if store.managing { AdminHomeView() } else { MemberHomeView() } }.tag("home")
            NavigationStack { EventsView(admin: store.managing) }.tag("events")
            NavigationStack { MemberCardView() }.tag("card")
            NavigationStack { SocialHubView() }.tag("hub")
            NavigationStack { ProfileView() }.tag("profile")
        }.id(store.navigationRevision).toolbar(.hidden, for: .tabBar)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 0) {
                    if store.managing {
                        AdminScopeBanner()
                    }
                    HStack(alignment: .top, spacing: 0) {
                        ForEach(items, id: \.0) { value, key, icon in
                            Button { store.tab = value } label: {
                                VStack(spacing: 4) {
                                    Rectangle().fill(store.tab == value ? Theme.color("gold") : Color.clear).frame(height: 3)
                                    Image(systemName: icon).font(.system(size: 20)).frame(width: 40, height: 30)
                                        .background(value == "card" ? Theme.color("secondary") : .clear, in: RoundedRectangle(cornerRadius: Theme.controlRadius))
                                    Text(L.t(key).uppercased()).font(Theme.body(11).weight(.bold)).tracking(0.44).lineLimit(1).minimumScaleFactor(0.7)
                                }.padding(.bottom, 8).frame(maxWidth: .infinity, minHeight: 60)
                                    .foregroundStyle(Theme.color(store.tab == value ? "bandText" : "bandMuted"))
                            }.buttonStyle(.plain).accessibilityLabel(L.t(key)).accessibilityAddTraits(store.tab == value ? .isSelected : []).disabled(store.operationInProgress)
                        }
                    }.background(Theme.color("band").ignoresSafeArea(edges: .bottom))
                }
            }
    }
}
struct AdminScopeBanner: View {
    @EnvironmentObject private var store: AppStore
    var body: some View {
        HStack { Image(systemName: "shield.lefthalf.filled"); Text(L.t(store.can("hq.manage") ? "ux.mode.hqScope" : "ux.mode.cityScope", ["scope": store.scope])).fontWeight(.semibold); Spacer() }
            .font(Theme.body(12)).padding(.horizontal, Theme.padding).padding(.vertical, 8).foregroundStyle(Theme.color("secondaryText")).background(Theme.color("secondary"))
    }
}
struct StaffMemberState: View {
    @EnvironmentObject private var store: AppStore
    var body: some View {
        EmptyState(title: "ux.staff.noMembership", message: "ux.staff.noMembershipBody", icon: "person.crop.circle.badge.questionmark")
        if store.admin { Button(L.t("ux.staff.openAccount")) { store.tab = "profile" }.buttonStyle(PATSButtonStyle(variant: .maroon)) }
    }
}
struct MemberHomeView: View {
    @Environment(\.scenePhase) private var phase
    @EnvironmentObject private var store: AppStore
    @StateObject private var events = Resource()
    var body: some View {
        Page(title: "ux.home.title") {
            if store.offline { Notice(text: L.t("native.offline")) }
            if store.member.exists {
                ResourceState(resource: events) { await events.load("/api/events") }
                if let event = events.data["upcoming"].rows.first {
                    MemberJourneyView(event: event)
                    NavigationRow(title: "ux.home.eventDetails", icon: "calendar") { EventDetailView(eventID: event.id) }
                } else if events.data.exists { EmptyState(title: "app.eventsEmptyTitle", message: "ux.home.noEvent", icon: "calendar") }
                ProfileXPView(memberID: store.member.id)
                Button(L.t("ktm.show")) { store.tab = "card" }.buttonStyle(PATSButtonStyle(variant: .maroon))
                Panel {
                    NavigationRow(title: "app.tabRewards", icon: "gift") { WalletView() }
                    NavigationRow(title: "app.notificationsTitle", icon: "bell") { NotificationsView() }
                }
            } else { StaffMemberState() }
        }.task { if store.member.exists { await events.load("/api/events") } }.onChange(of: phase) { _, p in if p == .active && store.member.exists { Task { await events.load("/api/events") } } }.refreshable { if store.member.exists { await events.load("/api/events") }; await store.reload() }
    }
}
struct AdminHomeView: View {
    @Environment(\.scenePhase) private var phase
    @EnvironmentObject private var store: AppStore
    @StateObject private var events = Resource()
    @StateObject private var operations = Resource()
    @StateObject private var claims = Resource()
    private var today: JSON? {
        (events.data["upcoming"].rows + events.data["past"].rows).first { event in
            guard let date = Dates.parse(event["startsAt"].text) else { return false }
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = TimeZone(identifier: event["city"]["timezone"].text) ?? .current
            return calendar.isDateInToday(date)
        }
    }
    var body: some View {
        Page(title: "ux.home.adminTitle") {
            ResourceState(resource: events) { await load() }
            if let event = today {
                Text(L.t("ux.home.today")).font(Theme.title(20))
                NavigationLink { EventDetailView(eventID: event.id, admin: true) } label: { EventPanel(event: event) }.buttonStyle(.plain)
            } else if events.data.exists { EmptyState(title: "ux.home.noToday", message: "ux.home.chooseEvent", icon: "calendar") }
            NavigationRow(title: "app.adminScan", subtitle: L.t("ux.home.scanContext"), icon: "qrcode.viewfinder") { ScanEventPicker() }
            NavigationRow(title: "app.adminEvents", icon: "calendar") { EventsView(admin: true) }
            Panel {
                Text(L.t("ux.home.pendingQueues")).font(Theme.title(20))
                ResourceState(resource: operations) { await operations.load("/api/social/operations") }
                NavigationRow(title: "social.reservations", subtitle: pending(operations.data["reservations"].rows, status: "PENDING", available: operations.data.exists && operations.error == nil), icon: "list.bullet.rectangle") { SocialOperationsView() }
                NavigationRow(title: "social.roaming", subtitle: pending(operations.data["roaming"].rows, status: "PENDING", available: operations.data.exists && operations.error == nil), icon: "globe.asia.australia") { SocialOperationsView(initialSection: "roaming") }
                if store.can("promoter.manage") {
                    ResourceState(resource: claims) { await claims.load("/api/admin/loyalty/claims") }
                    NavigationRow(title: "phase5.claimReview", subtitle: pending(claims.data["claims"].rows, status: "PENDING", available: claims.data.exists && claims.error == nil), icon: "doc.text.magnifyingglass") { ClaimsReviewView() }
                }
            }
            NavigationRow(title: "ux.home.moreTools", icon: "square.grid.2x2") { AdminToolsView() }
        }.task { await load() }.onChange(of: phase) { _, p in if p == .active { Task { await load() } } }.refreshable { await load(); await store.reload() }
    }
    private func pending(_ rows: [JSON], status: String, available: Bool) -> String { available ? L.t("ux.home.pendingCount", ["count": L.count(rows.filter { $0["status"].text == status }.count)]) : L.t("ux.home.countUnavailable") }
    private func load() async {
        async let a: Void = events.load("/api/admin/events")
        async let b: Void = operations.load("/api/social/operations")
        async let c: Void = loadClaims()
        _ = await (a, b, c)
    }
    private func loadClaims() async { if store.can("promoter.manage") { await claims.load("/api/admin/loyalty/claims") } }
}
struct ProfileView: View {
    @EnvironmentObject private var store: AppStore
    @AppStorage("theme") private var theme = "system"
    @State private var logout = false
    @State private var leaveError: String?
    @StateObject private var preference = Mutation()
    var body: some View {
        Page(title: "ux.tab.account") {
            if store.offline { Notice(text: L.t("native.offline")) }
            Panel {
                Text(store.user["name"].text).font(Theme.title())
                Text(store.user["email"].text).foregroundStyle(Theme.muted)
                if store.member.exists { Text(store.member["nim"].text).monospacedDigit() }
                Text(store.member.exists ? store.member["city"]["name"].text : store.user["city"]["name"].text)
                Badge(value: store.user["role"].text)
            }
            if store.admin {
                Panel {
                    Toggle(L.t("ux.mode.title"), isOn: $store.adminMode).disabled(store.operationInProgress)
                    Text(L.t("ux.mode.body")).font(Theme.body(14)).foregroundStyle(Theme.muted)
                    if store.managing { Label(store.scope, systemImage: "shield.lefthalf.filled") }
                    if store.operationInProgress { Notice(text: L.t("ux.mode.finishOperation")) }
                }
                if store.managing { NavigationRow(title: "ux.home.moreTools", icon: "square.grid.2x2") { AdminToolsView() } }
            }
            Panel {
                CardHeading(key: "ux.account.activity")
                NavigationRow(title: "app.notificationsTitle", icon: "bell") { NotificationsView() }
                if store.member.exists {
                    NavigationRow(title: "app.historyTitle", icon: "clock") { HistoryView() }
                    NavigationRow(title: "app.tabRewards", icon: "gift") { WalletView() }
                    NavigationRow(title: "phase5.claimTitle", icon: "doc.text") { ClaimsView() }
                    if !store.managing { NavigationRow(title: "ux.social.myRequests", icon: "list.bullet") { SocialOperationsView() } }
                }
            }
            if store.member.exists {
                Panel {
                    CardHeading(key: "ux.account.profile")
                    PhotoEditor()
                    NavigationRow(title: "ktm.editProfile", icon: "pencil") { ProfileEditor(member: store.member) }
                    DetailRow(key: "join.favoriteDrink", value: store.member["favoriteDrink"].text)
                    Text(store.member["quotes"].text).italic()
                    NavigationRow(title: "phase5.regionChange", icon: "globe.asia.australia") { RegionChangeView() }
                }
            } else { Notice(text: L.t("ux.staff.noMembershipBody")) }
            Panel {
                CardHeading(key: "ux.account.preferences")
                MutationState(mutation: preference)
                SectionLabel(key: "common.language")
                Tabs(options: [("id", "Bahasa Indonesia"), ("en", "English")], selection: Binding(get: { store.locale }, set: { value in
                    store.setLocale(value)
                    Task { await preference.send("/api/me", body: .object(["locale": .str(value)]), method: "PATCH", after: { await store.reload() }) }
                }))
                SectionLabel(key: "native.theme")
                Tabs(options: [("system", "native.system"), ("light", "native.light"), ("dark", "native.dark")], selection: $theme)
                Button(L.t("ux.account.welcome")) { store.showWelcome = true }.buttonStyle(PATSButtonStyle(variant: .secondary))
            }
            if store.member.exists {
                ConfirmAction(label: "phase5.leave", message: L.t("phase5.leaveConfirm"), destructive: true, disabled: store.operationInProgress) {
                    do { _ = try await APIClient.shared.call("POST", "/api/me/leave", .object([:])); await store.signOut() }
                    catch { leaveError = error.localizedDescription }
                }
                if let leaveError { Notice(text: leaveError, error: true) }
            }
            Button(L.t("common.signOut"), role: .destructive) { logout = true }.frame(minHeight: 44).disabled(store.operationInProgress)
        }
        .refreshable { await store.reload() }
        .alert(L.t("common.signOut"), isPresented: $logout) {
            Button(L.t("common.cancel"), role: .cancel) {}
            Button(L.t("common.signOut"), role: .destructive) { Task { await store.signOut() } }
        }
    }
}
struct AdminModeRequired<Content: View>: View {
    @EnvironmentObject private var store: AppStore
    let capability: String
    @ViewBuilder var content: Content
    var body: some View {
        if !store.can(capability) { EmptyState(title: "ux.mode.noAccess", message: "ux.mode.noAccessBody", icon: "lock") }
        else if store.managing { content }
        else {
            Page(title: "ux.mode.title") {
                Notice(text: L.t("ux.mode.openTask"))
                Button(L.t("ux.mode.enable")) { store.adminMode = true }.buttonStyle(PATSButtonStyle(variant: .maroon))
            }
        }
    }
}
struct LinkDestination: View {
    var link: AppLink
    @EnvironmentObject private var store: AppStore
    var body: some View {
        switch link {
        case .card(let token): PublicCardView(token: token)
        case .event(let id): EventDetailView(eventID: id, admin: store.managing)
        case .channel(let id): ChannelView(room: Room(kind: "channel", id: id))
        case .conversation(let id): ChannelView(room: Room(kind: "conversation", id: id))
        case .notifications: NotificationsView()
        case .claims(let id): if store.member.exists { ClaimsView(initialEventID: id) } else { StaffMemberState() }
        case .claimReview(let id): AdminModeRequired(capability: "promoter.manage") { ClaimsReviewView(initialEventID: id) }
        case .cardRequest(let id): AdminModeRequired(capability: "card.reportLost") { if id.isEmpty { MemberCardsView() } else { MemberCardsDetail(memberID: id) } }
        case .payments(let id): AdminModeRequired(capability: "dashboard.access") { SocialOperationsView(eventID: id) }
        case .recap(let id): AdminModeRequired(capability: "city.operations") { if id.isEmpty { CrewOperationsView() } else { EventRecapView(eventID: id) } }
        case .scan(let id): AdminModeRequired(capability: "checkin.scan") { if id.isEmpty { ScanEventPicker() } else { ScanView(eventID: id) } }
        case .requests(let id): SocialOperationsView(eventID: id)
        case .adminRequests(let id): AdminModeRequired(capability: "checkin.scan") { SocialOperationsView(eventID: id) }
        case .roaming(let id): SocialOperationsView(initialSection: "roaming", eventID: id)
        case .regionChange: if store.member.exists { RegionChangeView() } else { StaffMemberState() }
        case .wallet: if store.member.exists { WalletView() } else { StaffMemberState() }
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
