import SwiftUI

struct MemberCardView: View {
    @EnvironmentObject private var store: AppStore
    @StateObject private var state = Resource()
    @State private var deadline: QRDeadline?
    @State private var enlarged = false
    @Environment(\.scenePhase) private var phase
    var body: some View {
        Page(title: "app.cardTitle") {
            if store.member.exists {
                ResourceState(resource: state) { await refresh() }
                TimelineView(.periodic(from: .now, by: 1)) { time in
                    let remaining = deadline?.remaining(at: time.date) ?? 0
                    let valid = remaining > 0 && phase == .active && state.error == nil
                    KTMCard(member: store.member, token: valid ? deadline?.token : nil)
                    if valid, let deadline {
                        ProgressView(value: min(1, Double(remaining) / deadline.ttl)).tint(Theme.color("gold"))
                        Text(L.t("app.cardQrRefreshIn", ["seconds": L.count(remaining)])).font(Theme.body(13)).monospacedDigit()
                        Button(L.t("ktm.enlarge"), systemImage: "qrcode") { enlarged = true }.buttonStyle(PATSButtonStyle(variant: .maroon))
                    } else if !state.loading { Notice(text: L.t("native.expired")) }
                }
                HStack { SectionLabel(key: "app.physicalCard"); Badge(value: store.member["cardStatus"].text, member: true) }
                Panel {
                    DetailRow(key: "app.nim", value: store.member["nim"].text)
                    DetailRow(key: "app.song", value: store.member["favoriteSong"].text)
                    DetailRow(key: "join.quotes", value: store.member["quotes"].text)
                    DetailRow(key: "app.city", value: store.member["city"]["name"].text)
                }
                Text(L.t("app.cardQrBody", ["seconds": String(Int(deadline?.ttl ?? 60))])).font(Theme.body(13)).foregroundStyle(Theme.muted)
            } else { Notice(text: L.t("app.noMemberProfile")) }
        }
        .fullScreenCover(isPresented: $enlarged) { EnlargedQRView(initial: deadline) }
        .task {
            UIApplication.shared.isIdleTimerDisabled = true
            guard store.member.exists else { return }
            while !Task.isCancelled {
                if phase == .active { await refresh() }
                let delay = max(2, min(30, (deadline?.expiresAt.timeIntervalSinceNow ?? 5) - 5))
                do { try await Task.sleep(for: .seconds(delay)) } catch { break }
            }
        }
        .refreshable { await refresh(); await store.reload() }
        .onDisappear { if !enlarged { UIApplication.shared.isIdleTimerDisabled = false }; deadline = nil }
        .onChange(of: phase) { _, value in
            UIApplication.shared.isIdleTimerDisabled = value == .active
            if value != .active { deadline = nil } else { Task { await refresh() } }
        }
    }
    private func refresh() async {
        await state.load("/api/me/card-token")
        if state.error != nil { deadline = nil }
        if state.error == nil { deadline = QRDeadline(response: state.data, receivedAt: state.receivedAt, requestStartedAt: state.requestedAt) }
    }
}

struct EventsView: View {
    var admin = false
    @State private var all = false
    var body: some View {
        DataPage(title: admin ? "app.adminEventsTitle" : "events.title", path: admin ? "/api/admin/events" : "/api/events" + (all ? "?scope=all" : "")) { data, _ in
            if !admin { Toggle(L.t("events.allCities"), isOn: $all) }
            if admin { EventCreateLink() }
            if (data["upcoming"].rows + data["past"].rows).isEmpty { EmptyState(title: "app.eventsEmptyTitle", message: "native.emptyBody", icon: "calendar") }
            ForEach(["upcoming", "past"], id: \.self) { section in
                if !data[section].rows.isEmpty { Text(L.t(section == "upcoming" ? "app.eventsUpcoming" : "app.eventsPast")).font(Theme.title(20)) }
                ForEach(data[section].rows) { event in
                    NavigationLink { EventDetailView(eventID: event.id, admin: admin) } label: { EventPanel(event: event) }.buttonStyle(.plain)
                }
            }
        }
    }
}
struct EventPanel: View {
    let event: JSON
    var body: some View {
        Panel {
            if !event["flyerUrl"].text.isEmpty { RemoteImage(url: event["flyerUrl"].text).frame(maxHeight: 260) }
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
    var body: some View {
        DataPage(title: "events.details", path: "/api/\(admin ? "admin/" : "")events/\(eventID)", room: admin ? Room(kind: "attendance", id: eventID) : nil) { data, reload in
            let e = data["event"]
            EventPanel(event: e)
            Panel {
                Text(L.t("app.eventAbout")).font(Theme.title(17)); Text(e["description"].text)
                Text(L.t("events.window")).fontWeight(.semibold)
                Text(L.date(e["checkInOpensAt"].text, zone: e["city"]["timezone"].text))
                Text(L.date(e["checkInClosesAt"].text, zone: e["city"]["timezone"].text))
                if e["myCheckIn"].exists {
                    Text(L.t("ktm.checkedInVia", ["time": L.date(e["myCheckIn"]["checkedInAt"].text), "method": L.status(e["myCheckIn"]["method"].text)]))
                        .padding(Theme.gap).frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.color("band")).foregroundStyle(Theme.color("bandText"))
                }
            }
            if admin { AdminEventActions(event: e, reload: reload) }
            else {
                NavigationRow(title: "app.eventShowQr", icon: "qrcode") { MemberCardView() }
                NavigationRow(title: "social.reserve", icon: "square.grid.3x3") { ReservationView(eventID: eventID) }
                NavigationRow(title: "social.roaming", icon: "globe.asia.australia") { RoamingView(initialEventID: eventID) }
            }
            DrawView(eventID: eventID, ended: e["phase"].text == "ended")
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
        DataPage(title: "loyalty.title", path: "/api/loyalty/wallet", room: Room(kind: "wallet", id: store.member.id)) { data, reload in
            let event = data["events"].rows.first { $0.id == eventID } ?? data["events"].rows.first ?? .null
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
            Choice(label: "loyalty.selectEvent", options: data["events"].rows, selection: $eventID)
            MutationState(mutation: mutation)
            let rewards = data["rewards"].rows.filter { $0["type"].text == "DIRECT" && (!event.exists || $0["venueId"] == event["venueId"]) }
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
                let d = state.data
                Text(d["prize"].text.isEmpty ? L.t("phase5.notConfigured") : d["prize"].text).fontWeight(.semibold)
                if ended && !d["winnerEntryId"].exists { Text(L.t("ktm.noDrawResult")) }
                if !ended { Text(L.t("phase5.drawHint")).font(Theme.body(13)).foregroundStyle(Theme.muted)
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
                        ConfirmAction(label: store.can("draw.manage") ? "phase5.drawRun" : "phase5.drawEnter", message: L.t(store.can("draw.manage") ? "phase5.drawConfirm" : "phase5.drawHint"), maroon: true, disabled: mutation.busy || !d["prize"].exists || (store.can("draw.manage") ? d["entries"].rows.count != d["capacity"].int : (!inWindow || d["ownEntryId"].exists || d["entries"].rows.count >= d["capacity"].int))) {
                            var body: [String: JSON] = ["eventId": .str(eventID)]
                            if store.can("draw.manage") { body["action"] = .str("run") }
                            await mutation.send(store.can("draw.manage") ? "/api/admin/draw" : "/api/loyalty/spin", body: .object(body), after: load)
                        }
                    }
                }
            }
            MutationState(mutation: mutation)
        }
        .task(id: eventID) { await load(); connect() }
        .onDisappear { live.stop() }
        .onChange(of: phase) { _, p in if p == .active { connect(); Task { await load() } } else { live.stop() } }
    }
    private func load() async { await state.load(query("/api/loyalty/draw", ["eventId": eventID])) }
    private func connect() { live.start(kind: "draw", id: eventID) { await load() } }
}

struct LeaderboardView: View {
    @State private var city = ""
    @State private var event = ""
    @State private var monthDate = Date()
    @State private var scope = "city"
    @EnvironmentObject private var store: AppStore
    @State private var filter = ""
    var body: some View {
        DataPage(title: "loyalty.leaderboard", path: query("/api/loyalty/leaderboard", ["cityId": scope == "national" ? "" : (city.isEmpty ? store.member["city"].id : city), "eventId": event, "month": filter])) { data, _ in
            Tabs(options: [("city", "loyalty.city"), ("national", "loyalty.national")], selection: $scope)
            if scope == "city" { Choice(label: "loyalty.city", options: data["cities"].rows, selection: $city) }
            Badge(value: data["mode"].text)
            if data["periodStart"].exists { Text(L.activePeriod(mode: data["mode"].text, start: data["periodStart"].text, end: data["periodEnd"].text)).font(Theme.body(13)).foregroundStyle(Theme.color("goldText")) }
            if ["MONTHLY", "QUARTERLY"].contains(data["mode"].text) {
                DateTimeField(key: "loyalty.month", value: $monthDate)
                Button(L.t("loyalty.apply")) {
                    let f = DateFormatter(); f.locale = Locale(identifier: "en_GB"); f.timeZone = TimeZone(identifier: "Asia/Jakarta"); f.dateFormat = "yyyy-MM"; filter = f.string(from: monthDate)
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
        DataPage(title: "phase5.regionChange", path: "/api/me/region-change") { data, reload in
            Notice(text: L.t("phase5.regionHint"))
            Choice(label: "app.city", options: data["cities"].rows, selection: $city)
            Field(key: "phase5.reason", value: $reason)
            Button(L.t("common.save")) { Task { await mutation.send("/api/me/region-change", body: .object(["cityId": .str(city), "reason": .str(reason)]), after: reload) } }
                .buttonStyle(PATSButtonStyle(loading: mutation.busy)).disabled(city.isEmpty || reason.trimmingCharacters(in: .whitespacesAndNewlines).count < 3 || mutation.busy || data["requests"].rows.contains { $0["status"].text == "PENDING" })
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
    var body: some View {
        DataPage(title: "app.notificationsTitle", path: "/api/me/notifications") { data, _ in
            NavigationRow(title: "app.notificationSettingsTitle", icon: "bell.badge") { NotificationSettingsView() }
            if data["notifications"].rows.isEmpty { EmptyState(title: "app.notificationsEmptyTitle", message: "app.notificationsEmptyBody", icon: "bell") }
            ForEach(data["notifications"].rows) { row in
                Button {
                    if !row["data"]["conversationId"].text.isEmpty { store.link = .conversation(row["data"]["conversationId"].text) }
                    else if !row["data"]["channelId"].text.isEmpty { store.link = .channel(row["data"]["channelId"].text) }
                    else if !row["data"]["eventId"].text.isEmpty { store.link = .event(row["data"]["eventId"].text) }
                } label: {
                    Panel {
                        HStack { if !row["readAt"].exists { Circle().fill(Theme.accent).frame(width: 8, height: 8) }; Text(row["title"].text).fontWeight(.semibold) }
                        Text(row["body"].text).foregroundStyle(Theme.muted)
                        Text(L.date(row["sentAt"].text)).font(Theme.body(13)).foregroundStyle(Theme.muted)
                    }
                }.buttonStyle(.plain)
            }
        }.task { _ = try? await APIClient.shared.call("POST", "/api/me/notifications/read", .object(["all": .bool(true)])) }
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
