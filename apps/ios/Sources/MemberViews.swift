import SwiftUI

struct MemberCardView: View {
    @EnvironmentObject private var store: AppStore
    @StateObject private var state = Resource()
    @StateObject private var cardState = Resource()
    @StateObject private var attendance = Resource()
    @State private var deadline: QRDeadline?
    @State private var enlarged = false
    @Environment(\.scenePhase) private var phase
    private var event: JSON { attendance.data["event"].exists ? attendance.data["event"] : store.cardEvent }
    private var digitalReady: Bool { cardState.error == nil && cardState.data["digital"]["ready"].bool }
    private var cardMember: JSON {
        var value = store.member
        if cardState.data["face"].exists {
            value["fullName"] = cardState.data["face"]["name"]
            value["favoriteDrink"] = cardState.data["face"]["favoriteDrink"]
            value["quotes"] = cardState.data["face"]["quote"]
        }
        return value
    }
    var body: some View {
        Page(title: "ux.card.heading") {
            if store.member.exists {
                Panel {
                    HStack { Text(L.t("ux.card.digital")).font(Theme.title(20)); Spacer(); if digitalReady && deadline != nil && state.error == nil { Badge(value: "ux.card.ready") } }
                    Text(L.t("ux.card.digitalHint")).font(Theme.body(14)).foregroundStyle(Theme.muted)
                    ResourceState(resource: cardState) { await refresh() }
                    ResourceState(resource: state) { await refresh() }
                    if cardState.data.exists && !digitalReady { Notice(text: L.t("ux.card.digitalInactive")) }
                    if event.exists {
                        EventContextHeader(event: event)
                        AttendanceOutcome(event: event)
                        if let error = attendance.error { Notice(text: error, error: true) }
                        Button(L.t("ux.card.general")) { store.cardEvent = .null; store.cardEventID = ""; attendance.data = .null }.buttonStyle(PATSButtonStyle(variant: .secondary))
                    }
                    TimelineView(.periodic(from: .now, by: 1)) { time in
                        let remaining = deadline?.remaining(at: time.date) ?? 0
                        let valid = digitalReady && remaining > 0 && phase == .active && state.error == nil
                        if valid, let deadline {
                            Button(L.t("ux.card.showCrew"), systemImage: "qrcode") { enlarged = true }.buttonStyle(PATSButtonStyle(variant: .maroon)).disabled(event.exists && !EventJourneyPolicy.actionAvailable("showQr", in: event) && !event["myCheckIn"].exists)
                            ProgressView(value: min(1, Double(remaining) / deadline.ttl)).tint(Theme.color("gold"))
                            Text(L.t("app.cardQrRefreshIn", ["seconds": L.count(remaining)])).font(Theme.body(13)).monospacedDigit()
                        } else if !state.loading && state.error == nil { Notice(text: L.t("native.expired")) }
                    }
                }
                // Official artwork stays inside KTMCard and can be replaced without changing the task UI.
                TimelineView(.periodic(from: .now, by: 1)) { time in
                    KTMCard(member: cardMember, token: digitalReady && (deadline?.remaining(at: time.date) ?? 0) > 0 && phase == .active && state.error == nil ? deadline?.token : nil)
                }
                if cardState.data["physical"].exists {
                    let physical = cardState.data["physical"]
                    Panel {
                        Text(L.t("ux.card.physical")).font(Theme.title(20))
                        Text(L.t("ux.card.stage." + physical["stage"].text, ["city": store.member["city"]["name"].text])).fontWeight(.semibold)
                        if !physical["batchLabel"].text.isEmpty { Text(physical["batchLabel"].text).font(Theme.body(14)) }
                        if physical["shippedToCityAt"].exists { DetailRow(key: "ux.card.shippedAt", value: L.date(physical["shippedToCityAt"].text)) }
                        if physical["deliveredAt"].exists { DetailRow(key: "ux.card.deliveredAt", value: L.date(physical["deliveredAt"].text)) }
                        if physical["replacementFee"].exists {
                            let fee = physical["replacementFee"]
                            Text(L.t(fee["paidAt"].exists ? "ux.card.feePaid" : "ux.card.feeDue", ["amount": L.money(fee["amount"].int), "date": L.date(fee["paidAt"].text)]))
                        }
                        DetailRow(key: "app.nim", value: store.member["nim"].text)
                        DetailRow(key: "app.city", value: store.member["city"]["name"].text)
                    }
                }
                Text(L.t("app.cardQrBody", ["seconds": String(Int(deadline?.ttl ?? 60))])).font(Theme.body(13)).foregroundStyle(Theme.muted)
            } else { StaffMemberState() }
        }
        .fullScreenCover(isPresented: $enlarged) { EnlargedQRView(initial: deadline, event: event) }
        .task {
            guard store.member.exists else { return }
            while !Task.isCancelled {
                if phase == .active { await refresh(); await refreshAttendance() }
                let delay = max(2, min(15, (deadline?.expiresAt.timeIntervalSinceNow ?? 5) - 5))
                do { try await Task.sleep(for: .seconds(delay)) } catch { break }
            }
        }
        .task(id: store.cardEventID) { attendance.data = .null; await refreshAttendance() }
        .refreshable { await refresh(); await refreshAttendance(); await store.reload() }
        .onDisappear { deadline = nil }
        .onChange(of: phase) { _, value in
            if value != .active { deadline = nil } else { Task { await refresh(); await refreshAttendance() } }
        }
    }
    private func refreshAttendance() async {
        guard !store.cardEventID.isEmpty else { return }
        await attendance.load("/api/events/\(store.cardEventID)")
    }
    private func refresh() async {
        guard store.member.exists else { return }
        await cardState.load("/api/me/card")
        guard digitalReady else { deadline = nil; return }
        await state.load("/api/me/card-token")
        deadline = state.error == nil && !state.data["token"].text.isEmpty ? QRDeadline(response: state.data, receivedAt: state.receivedAt, requestStartedAt: state.requestedAt) : nil
    }
}

struct EventsView: View {
    var admin = false
    @EnvironmentObject private var store: AppStore
    @State private var all = false
    private var managing: Bool { admin && store.managing }
    var body: some View {
        Group {
        if !managing && !store.member.exists {
            Page(title: "events.title") {
                Notice(text: L.t(store.admin ? "ux.events.staffAccess" : "app.noMemberProfile"))
                if store.admin { Button(L.t("ux.events.openAccount")) { store.tab = "profile" }.buttonStyle(PATSButtonStyle(variant: .maroon)) }
            }
        } else {
        DataPage(title: "events.title", path: managing ? "/api/admin/events" : "/api/events" + (all ? "?scope=national" : "")) { data, _ in
            if !managing {
                Toggle(L.t("ux.events.national"), isOn: $all)
                Text(L.t(all ? "ux.events.allCities" : "ux.events.homeCity", ["city": store.member["city"]["name"].text])).font(Theme.body(14)).foregroundStyle(Theme.muted)
            }
            if managing { EventCreateLink() }
            if data["upcoming"].rows.isEmpty {
                EmptyState(title: "ux.events.noUpcoming", message: managing ? "ux.events.staffNoUpcoming" : all ? "ux.events.noNationalBody" : L.t("ux.events.noCityBody", ["city": store.member["city"]["name"].text]), icon: "calendar")
                if !managing && !all { Button(L.t("ux.events.browseCities")) { all = true }.buttonStyle(PATSButtonStyle(variant: .secondary)) }
            }
            ForEach(["upcoming", "past"], id: \.self) { section in
                if !data[section].rows.isEmpty { Text(L.t(section == "upcoming" ? "app.eventsUpcoming" : "app.eventsPast")).font(Theme.title(20)) }
                ForEach(data[section].rows) { event in
                    NavigationLink { EventDetailView(eventID: event.id, admin: managing) } label: { EventPanel(event: event) }.buttonStyle(.plain)
                }
            }
        }
        }
        }
    }
}
struct EventPanel: View {
    let event: JSON
    var body: some View {
        Panel {
            EventPosterHighlight(event: event)
            Badge(value: event["phase"].text)
            Text(event["title"].text).font(Theme.title(20))
            Text(L.date(event["startsAt"].text, zone: event["city"]["timezone"].text)).font(Theme.body(14))
            Text(event["venue"]["name"].text + " · " + event["city"]["name"].text).foregroundStyle(Theme.muted)
            if event["myCheckIn"].exists { Badge(value: "ktm.checkedIn") }
        }
    }
}
struct EventDetailView: View {
    let eventID: String
    var admin = false
    @EnvironmentObject private var store: AppStore
    private var managing: Bool { admin && store.managing }
    var body: some View {
        DataPage(title: managing ? "ux.workspace.title" : "events.details", path: managing ? "/api/admin/events/\(eventID)/workspace" : "/api/events/\(eventID)", room: managing ? Room(kind: "attendance", id: eventID) : nil, poll: !managing, pinLoadedEvent: managing) { data, reload in
            let e = data["event"]
            if managing { AdminEventWorkspace(workspace: data, reload: reload) }
            else {
                EventPanel(event: e)
                EventTiming(event: e)
                MemberJourneyView(event: e, initialJourney: data["journey"], initialReservation: data["myReservation"])
                Panel {
                    Text(L.t("ux.events.attendance")).font(Theme.title(20))
                    AttendanceOutcome(event: e)
                    if EventJourneyPolicy.actionAvailable("claimXp", in: e) { NavigationRow(title: "ux.events.claimBonus", icon: "doc.text") { ClaimsView(initialEventID: eventID) } }
                }
                if !e["poster"]["description"].text.isEmpty { Panel { Text(L.t("app.eventAbout")).font(Theme.title(17)); Text(e["poster"]["description"].text) } }
                if EventJourneyPolicy.actionAvailable("draw", in: e) { DrawView(eventID: eventID, ended: EventJourneyPolicy.ended(e)) }
                else if let reason = EventJourneyPolicy.actionReason("draw", in: e) { Text(L.t("ux.reason." + reason)).font(Theme.body(13)).foregroundStyle(Theme.muted) }
            }
        }
    }
}
struct HistoryView: View {
    var body: some View {
        DataPage(title: "app.historyTitle", path: "/api/me/check-ins") { data, _ in
            if data["checkIns"].rows.isEmpty { EmptyState(title: "app.historyEmptyTitle", message: "app.historyEmptyBody", icon: "clock") }
            ForEach(data["checkIns"].rows) { row in
                Panel {
                    NavigationRow(title: row["event"]["title"].text, subtitle: L.date(row["checkedInAt"].text), icon: "checkmark.circle") { EventDetailView(eventID: row["event"].id) }
                    Badge(value: row["method"].text)
                }
            }
        }
    }
}

struct WalletView: View {
    @EnvironmentObject private var store: AppStore
    @State private var eventID = ""
    @StateObject private var mutation = Mutation()
    var body: some View {
        let selectedEventID = eventID
        DataPage(title: "loyalty.title", path: "/api/loyalty/wallet", room: Room(kind: "wallet", id: store.member.id)) { data, reload in
            let event = data["events"].rows.first { $0.id == selectedEventID } ?? .null
            Panel {
                Text(L.t("loyalty.balance")).foregroundStyle(Theme.muted)
                Text(L.count(data["balance"].int) + " XP").font(Theme.title(32)).monospacedDigit()
                if data["milestone"].exists {
                    ProgressView(value: min(1, max(0, data["milestone"]["progress"].double))).tint(Theme.color("gold"))
                    Text(L.t("loyalty.milestone", ["remaining": L.count(data["milestone"]["remaining"].int), "reward": data["milestone"]["reward"]["name"].text]))
                }
            }
            Panel {
                NavigationRow(title: "loyalty.leaderboard", icon: "trophy") { LeaderboardView() }
                NavigationRow(title: "phase5.claimTitle", icon: "doc.text") { ClaimsView() }
            }
            Choice(label: "loyalty.selectEvent", options: data["events"].rows, selection: $eventID, allowEmpty: true, autoSelect: false)
            if event.exists { EventContextHeader(event: event) } else { Notice(text: L.t("ux.wallet.chooseEvent")) }
            MutationState(mutation: mutation)
            let rewards = data["rewards"].rows.filter { $0["type"].text == "DIRECT" && event.exists && $0["venueId"] == event["venueId"] }
            if rewards.isEmpty { EmptyState(title: "loyalty.emptyRewards", message: "loyalty.emptyRewardsBody", icon: "gift") }
            ForEach(rewards) { reward in
                Panel {
                    Text(reward["name"].text).font(Theme.title(20)); Text(reward["description"].text).foregroundStyle(Theme.muted)
                    Text(L.count(reward["xpCost"].int) + " XP").fontWeight(.semibold)
                    Text(reward["stock"].exists ? L.t("loyalty.stockLeft", ["count": L.count(reward["stock"].int)]) : L.t("loyalty.unlimited"))
                    ConfirmAction(label: "loyalty.redeem", message: L.t("loyalty.confirmRedeem"), disabled: mutation.busy || !event.exists || reward["stock"] == .number(0) || data["balance"].int < reward["xpCost"].int) {
                        await mutation.send("/api/loyalty/redeem", body: .object(["eventId": .str(event.id), "rewardId": .str(reward.id)]), after: reload)
                    }
                }
            }
            if event.exists { DrawView(eventID: event.id).id(event.id) }
            Text(L.t("loyalty.codes")).font(Theme.title(20))
            if data["redemptions"].rows.isEmpty { EmptyState(title: "loyalty.emptyCodes", message: "loyalty.emptyCodesBody", icon: "qrcode") }
            ForEach(data["redemptions"].rows) { r in
                Panel {
                    Text(r["reward"]["name"].text).font(Theme.title(17)); Badge(value: r["status"].text)
                    TimelineView(.periodic(from: .now, by: 1)) { time in
                        let remaining = max(0, Int(ceil((Dates.parse(r["expiresAt"].text) ?? .distantPast).timeIntervalSince(time.date))))
                        if r["status"].text == "ISSUED", remaining > 0 {
                            QRImage(value: r["code"].text).frame(maxWidth: .infinity)
                            Text(r["code"].text).font(Theme.title(32)).monospaced()
                            Text(L.t("loyalty.countdown", ["seconds": L.count(remaining)]))
                        } else if r["status"].text == "ISSUED" { Text(L.t("native.expired")) }
                    }
                    Text(L.date(r["expiresAt"].text)).font(Theme.body(13))
                }
            }
            ForEach(Array(data["expiring"].rows.enumerated()), id: \.offset) { _, lot in
                Text(L.t("phase5.xpExpiry", ["xp": L.count(lot["xp"].int), "date": L.date(lot["expiresAt"].text)])).font(Theme.body(13))
            }
            Text(L.t("loyalty.ledger")).font(Theme.title(20))
            if data["ledger"].rows.isEmpty { EmptyState() }
            ForEach(data["ledger"].rows) { row in
                Panel { Text("\(row["delta"].int > 0 ? "+" : "")\(L.count(row["delta"].int)) XP · \(L.status(row["reason"].text))"); Text(L.date(row["createdAt"].text)).font(Theme.body(13)).foregroundStyle(Theme.muted) }
            }
        }
    }
}
/// Staff draw reads its authorized wrapper; member draw keeps the existing member endpoint.
private enum DrawStateContract { static let staffPath = "/api/admin/draw" }
struct DrawView: View {
    let eventID: String
    var ended = false
    @EnvironmentObject private var store: AppStore
    @StateObject private var state = Resource()
    @StateObject private var live = RealtimeRoom()
    @StateObject private var mutation = Mutation()
    @Environment(\.scenePhase) private var phase
    var body: some View {
        Panel {
            Text(L.t("phase5.draw")).font(Theme.title(20))
            ResourceState(resource: state) { await load() }
            if state.data.exists {
                let d = managesDraw ? state.data["draw"] : state.data
                Text(d["prize"].text.isEmpty ? L.t("phase5.notConfigured") : d["prize"].text).fontWeight(.semibold)
                if ended && !d["winnerEntryId"].exists { Text(L.t("ktm.noDrawResult")) }
                if !ended { Text(L.t(managesDraw ? "ux.draw.runWhenFull" : "phase5.drawHint")).font(Theme.body(13)).foregroundStyle(Theme.muted)
                Text("\(L.count(d["entries"].rows.count)) / \(L.count(d["capacity"].int)) · \(L.count(d["costXp"].int)) XP")
                if d["peakStartsAt"].exists { Text(L.date(d["peakStartsAt"].text) + " — " + L.date(d["peakEndsAt"].text)).font(Theme.body(13)) }
                if d["freeCredit"].exists { Notice(text: L.t("phase5.drawFree")) }
                }
                if !ended { DrawSlots(entries: d["entries"].rows, capacity: d["capacity"].int, winnerID: d["winnerEntryId"].text) }
                if let winner = d["entries"].rows.first(where: { $0.id == d["winnerEntryId"].text }) {
                    Text(L.t("phase5.drawWinner", ["name": winner["name"].text])).font(Theme.title(20))
                }
                TimelineView(.periodic(from: .now, by: 1)) { time in
                    let inWindow = (Dates.parse(d["peakStartsAt"].text) ?? .distantFuture) <= time.date && (Dates.parse(d["peakEndsAt"].text) ?? .distantPast) >= time.date
                    if !ended && !d["startedAt"].exists {
                        ConfirmAction(label: managesDraw ? "phase5.drawRun" : "phase5.drawEnter", message: L.t(managesDraw ? "phase5.drawConfirm" : "phase5.drawHint"), maroon: true, disabled: mutation.busy || !d["prize"].exists || (managesDraw ? !state.data["canRun"].bool : (!inWindow || d["ownEntryId"].exists || d["entries"].rows.count >= d["capacity"].int))) {
                            var body: [String: JSON] = ["eventId": .str(eventID)]
                            if managesDraw { body["action"] = .str("run") }
                            await mutation.send(managesDraw ? "/api/admin/draw" : "/api/loyalty/spin", body: .object(body), after: load)
                        }
                    }
                }
            }
            MutationState(mutation: mutation)
        }
        .task(id: eventID) {
            await load(); connect()
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(15)) } catch { break }
                if phase == .active { await load() }
            }
        }
        .onDisappear { live.stop() }
        .onChange(of: phase) { _, p in if p == .active { connect(); Task { await load() } } else { live.stop() } }
        .onChange(of: store.managing) { _, _ in state.data = .null; Task { await load() } }
    }
    private var managesDraw: Bool { store.managing && store.can("draw.manage") }
    private func load() async {
        if managesDraw {
            await state.load(query(DrawStateContract.staffPath, ["eventId": eventID]))
        } else { await state.load(query("/api/loyalty/draw", ["eventId": eventID])) }
    }
    private func connect() {
        live.start(kind: "draw", id: eventID) { await load() }
    }
}

struct LeaderboardView: View {
    @State private var city = ""
    @State private var event = ""
    @State private var monthDate = Date()
    @State private var scope = "city"
    @EnvironmentObject private var store: AppStore
    @State private var filter = ""
    var body: some View {
        let selectedMonth = monthDate
        DataPage(title: "loyalty.leaderboard", path: query("/api/loyalty/leaderboard", ["cityId": scope == "national" ? "" : (city.isEmpty ? store.member["city"].id : city), "eventId": event, "month": filter])) { data, _ in
            Tabs(options: [("city", "loyalty.city"), ("national", "loyalty.national")], selection: $scope)
            if scope == "city" { Choice(label: "loyalty.city", options: data["cities"].rows, selection: $city) }
            Badge(value: data["mode"].text)
            if data["periodStart"].exists { Text(L.activePeriod(mode: data["mode"].text, start: data["periodStart"].text, end: data["periodEnd"].text)).font(Theme.body(13)).foregroundStyle(Theme.color("goldText")) }
            if ["MONTHLY", "QUARTERLY"].contains(data["mode"].text) {
                DateTimeField(key: "loyalty.month", value: $monthDate)
                Button(L.t("loyalty.apply")) {
                    let f = DateFormatter(); f.locale = Locale(identifier: "en_GB"); f.timeZone = TimeZone(identifier: "Asia/Jakarta"); f.dateFormat = "yyyy-MM"; filter = f.string(from: selectedMonth)
                }
            }
            if data["mode"].text == "EVENT" { Choice(label: "loyalty.event", options: data["events"].rows, selection: $event) }
            if data["self"].exists {
                Panel { Text(L.t("loyalty.self") + ": " + L.count(data["self"]["rank"].int)).font(Theme.title(20)); Text(L.count(data["self"]["xp"].int) + " XP") }
            }
            if data["entries"].rows.isEmpty { EmptyState(title: "loyalty.emptyRank", message: "loyalty.emptyRankBody", icon: "trophy") }
            ForEach(Array(data["entries"].rows.enumerated()), id: \.offset) { _, row in
                Panel {
                    HStack {
                        RankChip(rank: row["rank"].int)
                        VStack(alignment: .leading) { Text(row["name"].text).fontWeight(.bold); Text(row["city"].text).font(Theme.body(13)).foregroundStyle(Theme.muted) }
                        Spacer(); Text(L.count(row["xp"].int) + " XP").fontWeight(.heavy).monospacedDigit()
                    }
                }
            }
        }
    }
}

struct RegionChangeView: View {
    @State private var city = ""
    @State private var reason = ""
    @StateObject private var mutation = Mutation()
    var body: some View {
        let selectedCity = city
        let requestReason = reason
        DataPage(title: "phase5.regionChange", path: "/api/me/region-change") { data, reload in
            Notice(text: L.t("phase5.regionHint"))
            Choice(label: "app.city", options: data["cities"].rows, selection: $city)
            Field(key: "phase5.reason", value: $reason)
            Button(L.t("common.save")) { Task { await mutation.send("/api/me/region-change", body: .object(["cityId": .str(selectedCity), "reason": .str(requestReason)]), after: reload) } }
                .buttonStyle(PATSButtonStyle(loading: mutation.busy)).disabled(selectedCity.isEmpty || requestReason.trimmingCharacters(in: .whitespacesAndNewlines).count < 3 || mutation.busy || data["requests"].rows.contains { $0["status"].text == "PENDING" })
            MutationState(mutation: mutation)
            if data["requests"].rows.isEmpty { EmptyState(title: "phase5.regionEmpty") }
            ForEach(data["requests"].rows) { row in Panel { Text(row["toCity"]["name"].text).fontWeight(.semibold); Badge(value: row["status"].text); Text(row["decisionNote"].text) } }
        }
    }
}
struct ProfileXPView: View {
    let memberID: String
    @StateObject private var state = Resource()
    @StateObject private var live = RealtimeRoom()
    @Environment(\.scenePhase) private var phase
    var body: some View {
        Panel {
            Text(L.t("loyalty.balance")).foregroundStyle(Theme.muted)
            ResourceState(resource: state) { await load() }
            if state.data.exists {
                Text(L.count(state.data["balance"].int) + " XP").font(Theme.title(32)).monospacedDigit()
                if state.data["milestone"].exists {
                    ProgressView(value: min(1, max(0, state.data["milestone"]["progress"].double))).tint(Theme.color("gold"))
                    Text(state.data["milestone"]["reward"]["name"].text).font(Theme.body(13))
                }
            }
            NavigationRow(title: "loyalty.leaderboard", icon: "trophy") { LeaderboardView() }
        }.task { await load(); connect() }.onDisappear { live.stop() }
            .onChange(of: phase) { _, p in if p == .active { connect(); Task { await load() } } else { live.stop() } }
    }
    private func load() async { await state.load("/api/loyalty/wallet") }
    private func connect() { live.start(kind: "wallet", id: memberID) { await load() } }
}
struct NotificationsView: View {
    @EnvironmentObject private var store: AppStore
    @StateObject private var mutation = Mutation()
    var body: some View {
        DataPage(title: "app.notificationsTitle", path: "/api/me/notifications") { data, reload in
            NavigationRow(title: "app.notificationSettingsTitle", icon: "bell.badge") { NotificationSettingsView() }
            if max(data["unread"].int, data["unreadCount"].int) > 0 || data["notifications"].rows.contains(where: { !$0["readAt"].exists }) {
                Button(L.t("ux.notifications.markAll")) { Task { await mutation.send("/api/me/notifications/read", body: .object(["all": .bool(true)]), after: reload) } }.buttonStyle(PATSButtonStyle(variant: .secondary)).disabled(mutation.busy)
            }
            MutationState(mutation: mutation)
            if data["notifications"].rows.isEmpty { EmptyState(title: "app.notificationsEmptyTitle", message: "app.notificationsEmptyBody", icon: "bell") }
            ForEach(data["notifications"].rows) { row in
                Button {
                    Task {
                        if !row["readAt"].exists {
                            await mutation.run { _ = try await APIClient.shared.call("POST", "/api/me/notifications/\(row.id)/read", .object([:])); await reload() }
                        }
                        store.routeNotification(row["target"].exists ? row["target"] : row["data"])
                    }
                } label: {
                    Panel {
                        HStack { if !row["readAt"].exists { Circle().fill(Theme.accent).frame(width: 8, height: 8) }; Text(row["title"].text).fontWeight(.semibold) }
                        Text(row["body"].text).foregroundStyle(Theme.muted)
                        Text(L.date(row["sentAt"].text)).font(Theme.body(13)).foregroundStyle(Theme.muted)
                    }
                }.buttonStyle(.plain).disabled(mutation.busy)
            }
        }
    }
}
struct NotificationSettingsView: View {
    @StateObject private var mutation = Mutation()
    var body: some View {
        DataPage(title: "app.notificationSettingsTitle", path: "/api/me/notification-prefs") { data, reload in
            ForEach(["events", "activity"], id: \.self) { key in
                Toggle(L.t("app.notifCategory.\(key).title"), isOn: Binding(get: { data["prefs"][key].bool }, set: { value in Task { await mutation.send("/api/me/notification-prefs", body: .object([key: .bool(value)]), method: "PATCH", after: reload) } })).disabled(mutation.busy)
            }
            MutationState(mutation: mutation)
            Notice(text: L.t("app.pushUnavailable"))
            Button(L.t("native.push")) { Task { await PushRegistration.request() } }.buttonStyle(PATSButtonStyle(variant: .secondary))
        }
    }
}

struct EventContextHeader: View {
    let event: JSON
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(event["title"].text).font(Theme.title(17))
            if !event["city"]["name"].text.isEmpty || !event["startsAt"].text.isEmpty {
                Text([event["city"]["name"].text, event["startsAt"].text.isEmpty ? "" : L.date(event["startsAt"].text, zone: event["city"]["timezone"].text)].filter { !$0.isEmpty }.joined(separator: " · ")).font(Theme.body(13))
            }
            if !event["phase"].text.isEmpty { Badge(value: event["phase"].text) }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}
struct EventTiming: View {
    let event: JSON
    var body: some View {
        Panel {
            ForEach([("ux.events.starts", "startsAt"), ("ux.events.ends", "endsAt"), ("ux.events.opens", "checkInOpensAt"), ("ux.events.closes", "checkInClosesAt")], id: \.0) { label, field in
                DetailRow(key: label, value: L.date(event[field].text, zone: event["city"]["timezone"].text))
            }
            Text(event["city"]["timezone"].text).font(Theme.body(13)).foregroundStyle(Theme.muted)
        }
    }
}
struct AttendanceOutcome: View {
    let event: JSON
    var body: some View {
        if event["myCheckIn"].exists {
            Label(L.t("ktm.checkedIn"), systemImage: "checkmark.circle.fill").font(Theme.title(20))
            Text(L.t("ktm.checkedInVia", ["time": L.date(event["myCheckIn"]["checkedInAt"].text, zone: event["city"]["timezone"].text), "method": L.status(event["myCheckIn"]["method"].text)]))
            if event["myCheckIn"]["xp"].exists { Text(L.t("ux.events.attendanceXP", ["xp": L.count(event["myCheckIn"]["xp"].int)])) }
            else { Text(L.t("ux.events.xpInWallet")).font(Theme.body(13)).foregroundStyle(Theme.muted) }
        } else {
            Text(L.t(EventJourneyPolicy.ended(event) ? "ux.events.notAttended" : EventJourneyPolicy.checkInOpen(event) ? "ux.events.waitingCrew" : "ux.events.notCheckedIn")).foregroundStyle(Theme.muted)
        }
    }
}
struct EventPosterHighlight: View {
    let event: JSON
    @State private var fullPoster = false
    private var poster: String { event["poster"].exists ? event["poster"]["url"].text : event["posterUrl"].text.isEmpty ? event["flyerUrl"].text : event["posterUrl"].text }
    var body: some View {
        if !poster.isEmpty {
            Button { fullPoster = true } label: {
                VStack(alignment: .leading, spacing: 6) {
                    RemoteImage(url: poster).frame(maxHeight: 260)
                    Label(L.t("ux.events.posterDetails"), systemImage: "arrow.up.left.and.arrow.down.right").font(Theme.body(13))
                }
            }.buttonStyle(.plain)
                .sheet(isPresented: $fullPoster) { NavigationStack { EventPosterDetailView(event: event) } }
        }
    }
}
struct EventPosterDetailView: View {
    let event: JSON
    @Environment(\.dismiss) private var dismiss
    private var poster: String { event["poster"].exists ? event["poster"]["url"].text : event["posterUrl"].text.isEmpty ? event["flyerUrl"].text : event["posterUrl"].text }
    var body: some View {
        Page(title: "ux.events.posterDetails") {
            EventContextHeader(event: event)
            if !poster.isEmpty { RemoteImage(url: poster) }
            let description = event["poster"]["description"].exists ? event["poster"]["description"].text : event["description"].text
            if !description.isEmpty { Text(description) }
        }.toolbar { ToolbarItem(placement: .topBarTrailing) { Button(L.t("common.close")) { dismiss() } } }
    }
}
/// Deliberately isolated until the owner defines sharing destinations and rewards.
struct PosterBlastStep: View {
    let event: JSON
    let continueJourney: () -> Void
    @State private var placeholder = false
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.gap) {
            EventPosterHighlight(event: event)
            Text(L.t("ux.journey.posterPending")).font(Theme.body(14)).foregroundStyle(Theme.muted)
            Button(L.t("ux.journey.sharePoster"), systemImage: "square.and.arrow.up") { placeholder = true }.buttonStyle(PATSButtonStyle(variant: .maroon))
        }.alert(L.t("ux.journey.sharePoster"), isPresented: $placeholder) {
            Button(L.t("ux.journey.continue")) { continueJourney() }
            Button(L.t("common.cancel"), role: .cancel) { }
        } message: { Text(L.t("ux.journey.posterPending")) }
    }
}
struct MemberJourneyView: View {
    let event: JSON
    var initialJourney: JSON = .null
    var initialReservation: JSON = .null
    @EnvironmentObject private var store: AppStore
    @Environment(\.scenePhase) private var phase
    @StateObject private var detail = Resource()
    @StateObject private var mutation = Mutation()
    private var currentEvent: JSON { detail.data["event"].exists ? detail.data["event"] : event }
    private var steps: [JSON] { detail.data["journey"].exists ? detail.data["journey"].rows : initialJourney.rows }
    private var reservation: JSON { detail.data.exists ? detail.data["myReservation"] : initialReservation }
    private var current: JSON { steps.first { $0["state"].text == "current" } ?? .null }
    var body: some View {
        Panel {
            Text(L.t("ux.journey.title")).font(Theme.title(20))
            EventContextHeader(event: currentEvent)
            ResourceState(resource: detail) { await load() }
            MutationState(mutation: mutation)
            ForEach(Array(steps.enumerated()), id: \.offset) { _, step in
                HStack(spacing: Theme.gap) {
                    Image(systemName: step["state"].text == "done" ? "checkmark.circle.fill" : step["state"].text == "current" ? "circle.inset.filled" : "circle").foregroundStyle(step["state"].text == "upcoming" ? Theme.muted : Theme.accent)
                    Text(L.t("ux.journey." + step["key"].text)).fontWeight(step["state"].text == "current" ? .bold : .regular)
                    Spacer()
                    if step["state"].text == "done" { Text(L.t("ux.journey.done")).font(Theme.body(12)).foregroundStyle(Theme.muted) }
                }.accessibilityElement(children: .combine)
            }
            if !store.member.exists { StaffMemberState() }
            else if !steps.isEmpty {
                currentStep.disabled(mutation.busy || detail.error != nil)
            }
        }
        .task(id: event.id) {
            if detail.data["event"].id != event.id { detail.data = .null }
            await load()
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(15)) } catch { break }
                if phase == .active { await load() }
            }
        }
        .onChange(of: phase) { _, value in if value == .active { Task { await load() } } }
    }
    @ViewBuilder private var currentStep: some View {
        switch current["key"].text {
        case "event":
            Button(L.t("ux.journey.chooseEvent")) { Task { await record("event") } }.buttonStyle(PATSButtonStyle(variant: .maroon))
        case "poster":
            PosterBlastStep(event: currentEvent) { Task { await record("poster") } }
        case "reservation":
            if current["bonusXp"].exists { Text(L.t("ux.journey.reservationBonus", ["xp": L.count(current["bonusXp"].int)])).font(Theme.body(14)).foregroundStyle(Theme.muted) }
            if reservation.exists {
                Badge(value: reservation["status"].text)
                Text(reservation["slotCode"].text + " · " + L.count(reservation["pax"].int))
                if reservation["status"].text == "PENDING" { Notice(text: L.t("ux.journey.reservationRequested")) }
                if !reservation["conversationId"].text.isEmpty { NavigationRow(title: "social.chat", icon: "bubble.left") { ChannelView(room: Room(kind: "conversation", id: reservation["conversationId"].text)) } }
                NavigationRow(title: "ux.reservation.mine", icon: "list.bullet.rectangle") { SocialOperationsView(eventID: event.id) }
            } else {
                if EventJourneyPolicy.actionAvailable("reserve", in: currentEvent) {
                    NavigationRow(title: "ux.events.reservation", icon: "square.grid.3x3") { ReservationView(eventID: event.id) }
                } else { actionReason("reserve") }
                Button(L.t("ux.journey.reservationSkip")) { Task { await record("reservation") } }.buttonStyle(PATSButtonStyle(variant: .secondary))
            }
            Button(L.t("ux.journey.refreshReservation")) { Task { await load() } }.buttonStyle(.plain).frame(minHeight: 44)
        case "checkIn":
            AttendanceOutcome(event: currentEvent)
            if EventJourneyPolicy.actionAvailable("showQr", in: currentEvent) {
                Button(L.t("app.eventShowQr"), systemImage: "qrcode") { store.selectCard(event: currentEvent) }.buttonStyle(PATSButtonStyle(variant: .maroon))
            } else {
                actionReason("showQr")
                if EventJourneyPolicy.actionAvailable("roaming", in: currentEvent) { NavigationRow(title: "social.roaming", icon: "globe.asia.australia") { RoamingView(initialEventID: event.id) } }
            }
        case "completed":
            AttendanceOutcome(event: currentEvent)
            Text(L.t("ux.journey.waitForEnd")).font(Theme.body(14)).foregroundStyle(Theme.muted)
        default:
            if !steps.isEmpty && steps.allSatisfy({ $0["state"].text == "done" }) { Label(L.t("ux.journey.completed"), systemImage: "checkmark.seal.fill").font(Theme.title(17)) }
            AttendanceOutcome(event: currentEvent)
        }
        // Skipping a journey step never removes an onward action the server still permits.
        if current["key"].text != "reservation" && EventJourneyPolicy.actionAvailable("reserve", in: currentEvent) {
            NavigationRow(title: "ux.events.reservation", icon: "square.grid.3x3") { ReservationView(eventID: event.id) }
        }
        if current["key"].text != "checkIn" && EventJourneyPolicy.actionAvailable("showQr", in: currentEvent) {
            Button(L.t("app.eventShowQr"), systemImage: "qrcode") { store.selectCard(event: currentEvent) }.buttonStyle(PATSButtonStyle(variant: .maroon))
        }
        if current["key"].text != "checkIn" && EventJourneyPolicy.actionAvailable("roaming", in: currentEvent) {
            NavigationRow(title: "social.roaming", icon: "globe.asia.australia") { RoamingView(initialEventID: event.id) }
        }
        if EventJourneyPolicy.actionAvailable("claimXp", in: currentEvent) {
            NavigationRow(title: "ux.events.claimBonus", icon: "doc.text") { ClaimsView(initialEventID: event.id) }
        } else if EventJourneyPolicy.actionReason("claimXp", in: currentEvent) == "claimSubmitted" {
            NavigationRow(title: "phase5.claimTitle", subtitle: L.t("ux.reason.claimSubmitted"), icon: "doc.text") { ClaimsView(initialEventID: event.id) }
        }
    }
    @ViewBuilder private func actionReason(_ key: String) -> some View {
        if let reason = EventJourneyPolicy.actionReason(key, in: currentEvent) { Text(L.t("ux.reason." + reason)).font(Theme.body(14)).foregroundStyle(Theme.muted) }
    }
    private func load() async {
        guard store.member.exists else { return }
        await detail.load("/api/events/\(event.id)")
    }
    private func record(_ step: String) async {
        await mutation.run {
            let result = try await APIClient.shared.call("POST", "/api/me/journey", .object(["eventId": .str(event.id), "step": .str(step)]))
            detail.data = result; detail.error = nil
            await detail.load("/api/events/\(event.id)")
        }
    }
}
