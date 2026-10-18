import SwiftUI

struct SocialHubView: View {
    @EnvironmentObject private var store: AppStore
    @State private var city = ""
    var body: some View {
        DataPage(title: "social.title", path: "/api/social/hub") { data, _ in
            Panel {
                NavigationRow(title: store.admin ? "social.operations" : "social.reservations", icon: "list.bullet.rectangle") { SocialOperationsView() }
                if !store.admin { NavigationRow(title: "social.roaming", icon: "globe.asia.australia") { RoamingView() } }
            }
            let selected = data["cities"].rows.contains { $0.id == city } ? city : (data["homeCityId"].text.isEmpty ? data["cities"].rows.first?.id ?? "" : data["homeCityId"].text)
            Choice(label: "social.city", options: data["cities"].rows, selection: $city)
            if store.admin, !selected.isEmpty { NavigationRow(title: "social.newChannel", icon: "plus.bubble") { ChannelEditor(cityID: selected) } }
            let channels = data["channels"].rows.filter { $0["cityId"].text == selected }
            if channels.isEmpty { EmptyState(title: "social.noChannels", message: "social.noChannelsBody", icon: "bubble.left.and.bubble.right") }
            ForEach(channels) { channel in
                Panel { NavigationRow(title: channel["name"].text, subtitle: L.status(channel["kind"].text), icon: "bubble.left") { ChannelView(room: Room(kind: "channel", id: channel.id)) } }
            }
        }
    }
}
struct ChannelView: View {
    let room: Room
    @EnvironmentObject private var store: AppStore
    @Environment(\.scenePhase) private var phase
    @StateObject private var hub = Resource()
    @StateObject private var feed = Resource()
    @StateObject private var live = RealtimeRoom()
    @StateObject private var mutation = Mutation()
    @State private var items: [JSON] = []
    @State private var nextCursor = ""
    @State private var bodyText = ""
    @State private var attachment: JSON = .null
    @State private var captured = UIScreen.main.isCaptured
    @State private var lost = false
    @State private var screenshotTaken = false
    private var channel: JSON { hub.data["channels"].rows.first { $0.id == room.id } ?? .null }
    private var timeline: Bool { channel["kind"].text == "TIMELINE" }
    private var canPost: Bool { !channel["archived"].bool && (timeline ? channel["canPostTimeline"].bool : (store.admin || channel["memberPosting"] != .bool(false))) }
    var body: some View {
        Page(title: channel["name"].text.isEmpty ? "social.chat" : channel["name"].text) {
            if lost || live.accessLost || (room.kind == "channel" && hub.data.exists && !channel.exists) { Notice(text: L.t("native.accessLost"), error: true) }
            else if (captured || phase != .active) && room.kind == "channel" { Notice(text: L.t("native.captured")) }
            else {
                ResourceState(resource: hub) { await hub.load("/api/social/hub") }
                ResourceState(resource: feed) { await reload() }
                Text(L.t(live.connected ? "social.live" : "social.offline")).font(Theme.body(13)).foregroundStyle(Theme.muted)
                if room.kind == "channel" { Notice(text: L.t("social.secureHint")) }
                if screenshotTaken { Notice(text: L.t("native.captured")) }
                if store.admin && channel.exists { NavigationRow(title: "common.edit", icon: "pencil") { ChannelEditor(cityID: channel["cityId"].text, channel: channel) } }
                if items.isEmpty && !feed.loading { EmptyState(title: "social.emptyTitle", message: "social.emptyBody", icon: "bubble.left") }
                ForEach(ordered) { item in
                    Panel {
                        HStack { Text(item["author"]["name"].text).fontWeight(.semibold); if item["pinned"].bool { Image(systemName: "pin") } }
                        Text(L.date(item["createdAt"].text)).font(Theme.body(13)).foregroundStyle(Theme.muted)
                        if !item["body"].text.isEmpty { Text(item["body"].text).textSelection(.enabled) }
                        if !item["mediaUrl"].text.isEmpty { MediaPlayback(url: item["mediaUrl"].text, kind: item["mediaType"].text) }
                        if timeline {
                            Button(L.t(item["reacted"].bool ? "phase5.reacted" : "phase5.react") + " · " + L.count(item["reactionCount"].int), systemImage: "heart") {
                                Task { await mutate("react", .object(["postId": .str(item.id), "active": .bool(!item["reacted"].bool)])) }
                            }.buttonStyle(.bordered).disabled(mutation.busy)
                        }
                        if store.admin && channel.exists {
                            if timeline {
                                Button(L.t(item["pinned"].bool ? "social.unpin" : "social.pin")) { Task { await mutate("moderate", .object(["action": .str("pin"), "id": .str(item.id), "pinned": .bool(!item["pinned"].bool)])) } }.disabled(mutation.busy)
                            }
                            ConfirmAction(label: "social.delete", message: L.t("social.deleteBody"), destructive: true, disabled: mutation.busy) {
                                await mutate("moderate", .object(["action": .str(timeline ? "deletePost" : "deleteMessage"), "id": .str(item.id)]))
                            }
                            if item["author"].id != store.user.id {
                                ConfirmAction(label: "social.mute", message: L.t("social.muteBody"), destructive: true, disabled: mutation.busy) {
                                    await mutate("moderate", .object(["action": .str("mute"), "cityId": channel["cityId"], "userId": item["author"]["id"], "muted": .bool(true)]))
                                }
                            }
                        }
                    }
                }
                if !nextCursor.isEmpty { Button(L.t("native.loadMore")) { Task { await more() } }.buttonStyle(.bordered).disabled(mutation.busy) }
                MutationState(mutation: mutation)
                if canPost && hub.data.exists {
                    Panel {
                        Field(key: "social.message", value: $bodyText)
                        Text(L.t("social.mediaHint", ["seconds": hub.data["rules"]["mediaMaxSeconds"].text, "mb": hub.data["rules"]["mediaMaxMb"].text])).font(Theme.body(13)).foregroundStyle(Theme.muted)
                        CaptureControls(imageOnly: timeline, maxSeconds: max(1, hub.data["rules"]["mediaMaxSeconds"].int), busy: mutation.busy) { media in
                            let maxBytes = max(1, hub.data["rules"]["mediaMaxMb"].int) * 1024 * 1024
                            guard media.data.count <= maxBytes else { throw APIError(code: "MEDIA_INVALID") }
                            let signed = try await APIClient.shared.call("POST", "/api/social/upload", .object(["room": .object(["kind": .str(room.kind), "id": .str(room.id)]), "contentType": .str(media.contentType)]))
                            guard media.data.count <= signed["maxBytes"].int, let url = Config.mediaURL(signed["url"].text) else { throw APIError(code: "MEDIA_INVALID") }
                            try await APIClient.shared.upload(media.data, to: url, contentType: media.contentType)
                            attachment = .object(["mediaKey": signed["key"], "mediaType": .str(media.kind)])
                        }
                        if attachment.exists {
                            Label(L.t("social.attachment"), systemImage: "paperclip")
                            Button(L.t("social.removeAttachment")) { attachment = .null }
                        }
                        Button(L.t(timeline ? "social.post" : "social.send")) { Task { await send() } }
                            .buttonStyle(PATSButtonStyle()).disabled(mutation.busy || bodyText.count > 4000 || (bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !attachment.exists))
                    }
                }
            }
        }
        .task(id: room.id) {
            await hub.load("/api/social/hub"); await reload(); connect()
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(15)) } catch { break }
                if phase == .active && !lost && !live.accessLost { await reload() }
            }
        }
        .refreshable { await hub.load("/api/social/hub"); await reload() }
        .onDisappear { live.stop(); items = []; attachment = .null }
        .onChange(of: phase) { _, p in if p == .active { connect() } else { live.stop() } }
        .onReceive(NotificationCenter.default.publisher(for: UIScreen.capturedDidChangeNotification)) { _ in captured = UIScreen.main.isCaptured }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.userDidTakeScreenshotNotification)) { _ in
            if room.kind == "channel", phase == .active {
                screenshotTaken = true
                if store.member.exists { Task { _ = try? await APIClient.shared.call("POST", "/api/social/screenshot", .object(["channelId": .str(room.id), "platform": .str("IOS")])) } }
            }
        }
    }
    private var ordered: [JSON] {
        items.sorted {
            if timeline && $0["pinned"].bool != $1["pinned"].bool { return $0["pinned"].bool }
            let a = $0["createdAt"].text + $0.id, b = $1["createdAt"].text + $1.id
            return timeline ? a > b : a < b
        }
    }
    private var path: String { query("/api/social/feed", ["kind": room.kind, "id": room.id]) }
    private func reload() async {
        await feed.load(path)
        if feed.error == nil {
            // A full refresh replaces stale rows, including deleted messages.
            items = feed.data["items"].rows; nextCursor = feed.data["nextCursor"].text
        }
        let authenticated = await APIClient.shared.signedIn
        if ["FORBIDDEN", "UNAUTHENTICATED", "ACCOUNT_DISABLED"].contains(feed.failureCode ?? "") || !authenticated { lost = true; items = []; live.stop() }
    }
    private func more() async {
        await mutation.run {
            let data = try await APIClient.shared.call("GET", query("/api/social/feed", ["kind": room.kind, "id": room.id, "cursor": nextCursor]))
            var seen = Set(items.map(\.id))
            items += data["items"].rows.filter { seen.insert($0.id).inserted }; nextCursor = data["nextCursor"].text
        }
    }
    private func connect() { live.start(kind: room.kind, id: room.id) { await reload() } }
    private func mutate(_ action: String, _ body: JSON) async { await mutation.send("/api/social/\(action)", body: body, after: reload) }
    private func send() async {
        await mutation.run {
            var body = attachment.object
            body["body"] = .str(bodyText); body[room.kind == "channel" ? "channelId" : "conversationId"] = .str(room.id)
            if timeline { _ = try await APIClient.shared.call("POST", "/api/social/posts", .object(body)) }
            else if live.connected { try await live.send(.object(body)) }
            else { _ = try await APIClient.shared.call("POST", "/api/social/messages", .object(body)) }
            bodyText = ""; attachment = .null; await reload()
        }
    }
}

struct ChannelEditor: View {
    let cityID: String
    var channel: JSON = .null
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var kind = "CHAT"
    @State private var visibility = "MEMBERS"
    @State private var posting = "default"
    @State private var archived = false
    @StateObject private var mutation = Mutation()
    var body: some View {
        Page(title: channel.exists ? "common.edit" : "social.newChannel") {
            Field(key: "social.channelName", value: $name)
            Picker(L.t("social.kind"), selection: $kind) { Text(L.status("CHAT")).tag("CHAT"); Text(L.status("TIMELINE")).tag("TIMELINE") }.pickerStyle(.segmented)
            Picker(L.t("social.visibility"), selection: $visibility) { Text(L.status("MEMBERS")).tag("MEMBERS"); Text(L.status("ADMINS_ONLY")).tag("ADMINS_ONLY") }
            Picker(L.t("social.posting"), selection: $posting) {
                Text(L.t("common.notSet")).tag("default"); Text(L.t("common.yes")).tag("yes"); Text(L.t("common.no")).tag("no")
            }
            Toggle(L.t("social.archived"), isOn: $archived)
            MutationState(mutation: mutation)
            Button(L.t("common.save")) {
                Task { await mutation.run {
                    var body: [String: JSON] = ["cityId": .str(cityID), "name": .str(name), "kind": .str(kind), "visibility": .str(visibility), "memberPosting": posting == "default" ? .null : .bool(posting == "yes"), "archived": .bool(archived)]
                    if channel.exists { body["id"] = .str(channel.id) }
                    _ = try await APIClient.shared.call("POST", "/api/social/channels", .object(body)); dismiss()
                } }
            }.buttonStyle(PATSButtonStyle()).disabled(mutation.busy || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || name.count > 80)
        }.onAppear {
            if channel.exists { name = channel["name"].text; kind = channel["kind"].text; visibility = channel["visibility"].text; archived = channel["archived"].bool; posting = channel["memberPosting"].exists ? (channel["memberPosting"].bool ? "yes" : "no") : "default" }
        }
    }
}

struct RoamingView: View {
    var initialEventID = ""
    @EnvironmentObject private var store: AppStore
    @State private var eventID = ""
    @State private var kind = "ATTENDANCE"
    @StateObject private var mutation = Mutation()
    var body: some View {
        DataPage(title: "social.roaming", path: "/api/events?scope=all") { data, _ in
            Notice(text: L.t("social.roamingHint"))
            Choice(label: "social.event", options: data["upcoming"].rows.filter { $0["city"].id != store.member["city"].id }, selection: $eventID)
            Picker(L.t("social.kind"), selection: $kind) { Text(L.status("ATTENDANCE")).tag("ATTENDANCE"); Text(L.status("SOCIAL_HUB")).tag("SOCIAL_HUB") }
            Button(L.t("social.requestRoaming")) { Task { await mutation.send("/api/social/roaming", body: .object(["eventId": .str(eventID), "type": .str(kind)])) } }.buttonStyle(PATSButtonStyle()).disabled(eventID.isEmpty || mutation.busy)
            MutationState(mutation: mutation)
            NavigationRow(title: "social.review", icon: "list.bullet") { SocialOperationsView() }
        }.onAppear { if eventID.isEmpty { eventID = initialEventID } }
    }
}
struct ReservationView: View {
    let eventID: String
    @EnvironmentObject private var store: AppStore
    @State private var slot = ""
    @State private var pax = "1"
    @State private var note = ""
    @StateObject private var mutation = Mutation()
    var body: some View {
        DataPage(title: "social.reserve", path: query("/api/social/slots", ["eventId": eventID])) { data, reload in
            Text(data["eventTitle"].text).font(Theme.title(20)); Text(data["venueName"].text).foregroundStyle(Theme.muted)
            Notice(text: L.t("social.floorHint"))
            if data["slots"].rows.isEmpty { EmptyState(title: "social.noSlots", message: "social.noSlotsBody") }
            FloorPlan(slots: data["slots"].rows, taken: data["taken"].rows.map(\.text), selection: $slot)
            let available = data["slots"].rows.filter { !data["taken"].rows.contains($0["code"]) }
            Choice(label: "social.slot", options: available.map { .object(["id": $0["code"], "name": .str($0["code"].text + " · " + L.status($0["kind"].text) + " · " + $0["pax"].text)]) }, selection: $slot)
            let selected = available.first { $0["code"].text == slot } ?? .null
            if selected["minimumCharge"].exists { Text(L.t("phase5.minimumCharge") + ": " + L.money(selected["minimumCharge"].int)) }
            if !selected["minimumSpend"].text.isEmpty { Text(selected["minimumSpend"].text) }
            Field(key: "social.pax", value: $pax, keyboard: .numberPad)
            Field(key: "social.note", value: $note)
            MutationState(mutation: mutation)
            ConfirmAction(label: "social.reserve", message: L.t("social.floorHint"), disabled: mutation.busy || !selected.exists || (Int(pax).map { $0 < 1 || $0 > min(100, selected["pax"].int) } ?? true) || note.count > 4000) {
                await mutation.run {
                    let result = try await APIClient.shared.call("POST", "/api/social/reserve", .object(["eventId": .str(eventID), "slotCode": .str(slot), "pax": .num(Int(pax) ?? 1), "note": .str(note)]))
                    await reload(); if !result["conversationId"].text.isEmpty { store.link = .conversation(result["conversationId"].text) }
                }
            }
        }
    }
}
struct FloorPlan: View {
    var slots: [JSON]
    var taken: [String]
    @Binding var selection: String
    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .topLeading) {
                Theme.color("surfaceMuted")
                ForEach(Array(slots.enumerated()), id: \.offset) { _, s in
                    let code = s["code"].text
                    Button(code) { selection = code }
                        .font(Theme.body(11)).foregroundStyle(selection == code ? Theme.color("primaryText") : Theme.text)
                        .frame(width: geometry.size.width * CGFloat(s["w"].int)/12 - 2, height: geometry.size.height * CGFloat(s["h"].int)/12 - 2)
                        .background(taken.contains(code) ? Theme.border : selection == code ? Theme.color("primary") : Theme.color("accentSubtle"), in: RoundedRectangle(cornerRadius: 8))
                        .offset(x: geometry.size.width * CGFloat(s["x"].int)/12, y: geometry.size.height * CGFloat(s["y"].int)/12)
                        .disabled(taken.contains(code)).accessibilityLabel(code + ", " + L.status(s["kind"].text) + ", " + s["pax"].text)
                }
            }.clipShape(RoundedRectangle(cornerRadius: 12))
        }.aspectRatio(1, contentMode: .fit).accessibilityHidden(true)
    }
}
struct SocialOperationsView: View {
    @EnvironmentObject private var store: AppStore
    @StateObject private var mutation = Mutation()
    var body: some View {
        DataPage(title: store.admin ? "social.operations" : "social.reservations", path: "/api/social/operations", poll: true) { data, reload in
            MutationState(mutation: mutation)
            Text(L.t("social.reservations")).font(Theme.title(20))
            if data["reservations"].rows.isEmpty { EmptyState(title: "social.noRequests", message: "social.noRequestsBody") }
            ForEach(data["reservations"].rows) { r in
                Panel {
                    Text(r["event"]["title"].text + " · " + r["slotCode"].text).font(Theme.title(17))
                    Text(r["member"]["fullName"].text + " · " + L.count(r["pax"].int)); Badge(value: r["status"].text)
                    Text(r["note"].text)
                    if r["minimumCharge"].exists { Text(L.t("phase5.minimumCharge") + ": " + L.money(r["minimumCharge"].int)) }
                    Badge(value: r["downPaymentAt"].exists ? "paid" : "unpaid")
                    if r["conversation"].exists { NavigationRow(title: "social.chat", icon: "bubble.left") { ChannelView(room: Room(kind: "conversation", id: r["conversation"].id)) } }
                    if r["canDecide"].bool && r["status"].text == "PENDING" {
                        decision("social.confirm", action: "reservation-decision", body: .object(["id": .str(r.id), "status": .str("CONFIRMED")]), reload: reload)
                        decision("social.reject", action: "reservation-decision", body: .object(["id": .str(r.id), "status": .str("REJECTED")]), reload: reload)
                    }
                    if (!store.admin || r["canDecide"].bool) && ["PENDING", "CONFIRMED"].contains(r["status"].text) {
                        decision("social.cancelReservation", action: "reservation-decision", body: .object(["id": .str(r.id), "status": .str("CANCELLED")]), reload: reload)
                    }
                }
            }
            Text(L.t("social.roaming")).font(Theme.title(20))
            ForEach(data["roaming"].rows) { r in
                Panel {
                    Text(r["member"]["fullName"].text + " · " + r["event"]["title"].text).fontWeight(.semibold)
                    Badge(value: r["status"].text); Text(L.status(r["type"].text))
                    if r["accessExpiresAt"].exists { Text(L.date(r["accessExpiresAt"].text)) }
                    if r["status"].text == "PENDING" && (r["type"].text == "ATTENDANCE" ? store.can("city.operations") : store.can("hq.manage")) {
                        decision("social.approve", action: "roaming-decision", body: .object(["id": .str(r.id), "decision": .str("APPROVED")]), reload: reload)
                        decision("social.reject", action: "roaming-decision", body: .object(["id": .str(r.id), "decision": .str("REJECTED")]), reload: reload)
                    }
                }
            }
            if store.admin {
                Text(L.t("social.muted")).font(Theme.title(20))
                ForEach(Array(data["muted"].rows.enumerated()), id: \.offset) { _, m in
                    Panel { Text(m["name"].text); decision("social.unmute", action: "moderate", body: .object(["action": .str("mute"), "cityId": m["cityId"], "userId": m["userId"], "muted": .bool(false)]), reload: reload) }
                }
                Text(L.t("social.screenshots")).font(Theme.title(20))
                ForEach(Array(data["screenshots"].rows.enumerated()), id: \.offset) { _, row in Text(row["name"].text + " · " + L.count(row["count"].int)) }
            }
        }
    }
    private func decision(_ key: String, action: String, body: JSON, reload: @escaping () async -> Void) -> some View {
        ConfirmAction(label: key, message: L.t("social.decisionBody"), disabled: mutation.busy) { await mutation.send("/api/social/\(action)", body: body, after: reload) }
    }
}
