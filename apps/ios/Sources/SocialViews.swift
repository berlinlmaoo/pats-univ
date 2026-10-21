import SwiftUI

struct SocialHubView: View {
    @EnvironmentObject private var store: AppStore
    @State private var city = ""
    @State private var section = "TIMELINE"
    @State private var selectedChannel = ""
    @StateObject private var hub = Resource()
    var body: some View {
        Page(title: "social.title") {
            if store.admin && !store.member.exists && hub.failureCode == "FORBIDDEN" {
                EmptyState(title: "ux.social.staffHubUnavailable", message: "ux.social.staffContext", icon: "bubble.left.and.bubble.right")
                if !store.managing {
                    Button(L.t("ux.social.enableAdminMode")) { store.adminMode = true }.buttonStyle(PATSButtonStyle(variant: .secondary))
                }
                Button(L.t("common.retry")) { Task { await hub.load("/api/social/hub") } }.buttonStyle(PATSButtonStyle(variant: .secondary))
            } else {
                ResourceState(resource: hub) { await hub.load("/api/social/hub") }
                if hub.data.exists { channels(hub.data) }
            }
        }
        .task { await hub.load("/api/social/hub") }
        .refreshable { await hub.load("/api/social/hub") }
    }
    @ViewBuilder private func channels(_ data: JSON) -> some View {
        Tabs(options: [("TIMELINE", "social.timeline"), ("CHAT", "social.chat")], selection: $section)
        let selected = data["cities"].rows.contains { $0.id == city } ? city : (data["homeCityId"].text.isEmpty ? data["cities"].rows.first?.id ?? "" : data["homeCityId"].text)
        Choice(label: "social.city", options: data["cities"].rows, selection: $city)
        if !store.member.exists && !store.managing { Notice(text: L.t("ux.social.staffContext")) }
        if store.managing, !selected.isEmpty {
            NavigationRow(title: "social.newChannel", icon: "plus.bubble") { ChannelEditor(cityID: selected) }
        }
        let channels = data["channels"].rows.filter {
            $0["cityId"].text == selected && $0["kind"].text == section &&
            (store.managing || (!$0["archived"].bool && $0["visibility"].text != "ADMINS_ONLY"))
        }
        if channels.isEmpty { EmptyState(title: "social.noChannels", message: "social.noChannelsBody", icon: "bubble.left.and.bubble.right") }
        else { Text(L.t("ktm.chooseChannel")).foregroundStyle(Theme.muted) }
        ForEach(channels) { channel in
            Panel {
                NavigationRow(title: channel["name"].text, subtitle: L.status(channel["kind"].text), icon: "bubble.left") { ChannelView(room: Room(kind: "channel", id: channel.id)) }
                    .simultaneousGesture(TapGesture().onEnded { selectedChannel = channel.id })
            }.overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(selectedChannel == channel.id ? Theme.color("accent") : .clear, lineWidth: 2))
        }
        Panel {
            NavigationRow(title: store.managing ? "social.operations" : "ux.social.myRequests", icon: "list.bullet.rectangle") { SocialOperationsView() }
            if store.member.exists && !store.managing { NavigationRow(title: "social.roaming", icon: "globe.asia.australia") { RoamingView() } }
        }
    }
}
struct ChannelView: View {
    let room: Room
    @EnvironmentObject private var store: AppStore
    @Environment(\.scenePhase) private var phase
    @StateObject private var hub = Resource()
    @StateObject private var feed = Resource()
    @StateObject private var personalRequests = Resource()
    @State private var ownershipChecked = false
    @StateObject private var live = RealtimeRoom()
    @StateObject private var mutation = Mutation()
    @State private var items: [JSON] = []
    @State private var nextCursor = ""
    @State private var bodyText = ""
    @State private var attachment: JSON = .null
    @State private var sendKey = DraftSendKey()
    @State private var captured = UIScreen.main.isCaptured
    @State private var lost = false
    @State private var screenshotTaken = false
    private var channel: JSON { hub.data["channels"].rows.first { $0.id == room.id } ?? .null }
    private var timeline: Bool { channel["kind"].text == "TIMELINE" }
    private var checkingOwnership: Bool {
        room.kind == "conversation" && store.admin && !store.managing && !ownershipChecked
    }
    private var ownsConversation: Bool {
        guard store.member.exists else { return false }
        return personalRequests.data["reservations"].rows.contains {
            $0["memberId"].text == store.member.id && $0["conversation"].id == room.id
        }
    }
    private var needsAdminMode: Bool {
        guard !store.managing else { return false }
        if room.kind == "conversation" && store.admin { return ownershipChecked && !ownsConversation }
        return room.kind == "channel" && channel.exists && (channel["archived"].bool || channel["visibility"].text == "ADMINS_ONLY")
    }
    private var canPost: Bool {
        guard !needsAdminMode && !checkingOwnership else { return false }
        if room.kind == "conversation" { return store.managing || store.member.exists }
        guard !channel["archived"].bool else { return false }
        return timeline ? store.managing && channel["canPostTimeline"].bool : (store.managing || (store.member.exists && channel["memberPosting"] != .bool(false)))
    }
    var body: some View {
        Page(title: channel["name"].text.isEmpty ? "social.chat" : channel["name"].text) {
            if checkingOwnership { Skeleton() }
            else if lost || live.accessLost || (room.kind == "channel" && hub.data.exists && !channel.exists) { Notice(text: L.t("native.accessLost"), error: true) }
            else if needsAdminMode {
                Notice(text: L.t("ux.social.adminModeRequired"))
                if room.kind == "conversation" && store.member.exists {
                    ResourceState(resource: personalRequests) { await checkConversationOwnership(); await reload(); connect() }
                }
                if store.admin {
                    Button(L.t("ux.social.enableAdminMode")) { store.adminMode = true }
                        .buttonStyle(PATSButtonStyle(variant: .secondary))
                }
            }
            else if (captured || phase != .active) && room.kind == "channel" { Notice(text: L.t("native.captured")) }
            else {
                ResourceState(resource: hub) { await hub.load("/api/social/hub") }
                ResourceState(resource: feed) { await reload() }
                Text(L.t(live.connected ? "social.live" : "social.offline")).font(Theme.body(13)).foregroundStyle(Theme.muted)
                if room.kind == "channel" { Notice(text: L.t("social.secureHint")) }
                if screenshotTaken { Notice(text: L.t("native.captured")) }
                if store.managing && channel.exists { NavigationRow(title: "common.edit", icon: "pencil") { ChannelEditor(cityID: channel["cityId"].text, channel: channel) } }
                if items.isEmpty && !feed.loading && feed.error == nil { EmptyState(title: "social.emptyTitle", message: "social.emptyBody", icon: "bubble.left") }
                ForEach(ordered) { item in
                    Panel {
                        HStack { Text(item["author"]["name"].text).fontWeight(.semibold); if item["pinned"].bool { Image(systemName: "pin") } }
                        Text(L.date(item["createdAt"].text)).font(Theme.body(13)).foregroundStyle(Theme.muted)
                        if !item["body"].text.isEmpty { Text(item["body"].text).textSelection(.enabled) }
                        if !item["mediaUrl"].text.isEmpty { MediaPlayback(url: item["mediaUrl"].text, kind: item["mediaType"].text) }
                        if timeline && store.member.exists {
                            Button(L.t(item["reacted"].bool ? "phase5.reacted" : "phase5.react") + " · " + L.count(item["reactionCount"].int), systemImage: "heart") {
                                Task { await mutate("react", .object(["postId": .str(item.id), "active": .bool(!item["reacted"].bool)])) }
                            }.buttonStyle(PATSButtonStyle(variant: .secondary)).disabled(mutation.busy)
                        }
                        if store.managing && channel.exists {
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
                if !nextCursor.isEmpty { Button(L.t("native.loadMore")) { Task { await more() } }.buttonStyle(PATSButtonStyle(variant: .secondary)).disabled(mutation.busy) }
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
                            .buttonStyle(PATSButtonStyle(loading: mutation.busy)).disabled(mutation.busy || bodyText.count > 4000 || (bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !attachment.exists))
                    }
                }
            }
        }
        .task(id: room.id) {
            await checkConversationOwnership()
            await hub.load("/api/social/hub"); await reload(); connect()
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(15)) } catch { break }
                if phase == .active && !lost && !live.accessLost { await reload() }
            }
        }
        .refreshable { await checkConversationOwnership(); await hub.load("/api/social/hub"); await reload() }
        .onDisappear { live.stop(); items = []; attachment = .null }
        .onChange(of: bodyText) { _, _ in sendKey.update(text: bodyText, attachment: attachment["mediaKey"].text) }
        .onChange(of: attachment) { _, _ in sendKey.update(text: bodyText, attachment: attachment["mediaKey"].text) }
        .onChange(of: room) { _, _ in sendKey.reset() }
        .onChange(of: store.managing) { _, _ in
            live.stop(); items = []
            Task { await checkConversationOwnership(); await reload(); connect() }
        }
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
    private func checkConversationOwnership() async {
        ownershipChecked = false
        if room.kind == "conversation" && store.admin && !store.managing && store.member.exists {
            await personalRequests.load("/api/social/operations")
        }
        ownershipChecked = true
    }
    private func reload() async {
        guard !checkingOwnership && !needsAdminMode else { items = []; live.stop(); return }
        await feed.load(path)
        if feed.error == nil {
            // A full refresh replaces stale rows, including deleted messages.
            items = feed.data["items"].rows; nextCursor = feed.data["nextCursor"].text
        }
        let authenticated = await APIClient.shared.signedIn
        if ["FORBIDDEN", "UNAUTHENTICATED", "ACCOUNT_DISABLED"].contains(feed.failureCode ?? "") || !authenticated { lost = true; items = []; live.stop() }
    }
    private func more() async {
        guard !checkingOwnership && !needsAdminMode else { return }
        await mutation.run {
            let data = try await APIClient.shared.call("GET", query("/api/social/feed", ["kind": room.kind, "id": room.id, "cursor": nextCursor]))
            var seen = Set(items.map(\.id))
            items += data["items"].rows.filter { seen.insert($0.id).inserted }; nextCursor = data["nextCursor"].text
        }
    }
    private func connect() {
        guard !checkingOwnership && !needsAdminMode else { return }
        live.start(kind: room.kind, id: room.id) { await reload() }
    }
    private func mutate(_ action: String, _ body: JSON) async {
        guard action == "react" ? store.member.exists : store.managing else { return }
        await mutation.send("/api/social/\(action)", body: body, after: reload)
    }
    private func send() async {
        guard canPost && !needsAdminMode else { return }
        await mutation.run {
            var body = attachment.object
            body["body"] = .str(bodyText); body[room.kind == "channel" ? "channelId" : "conversationId"] = .str(room.id)
            if timeline { _ = try await APIClient.shared.call("POST", "/api/social/posts", .object(body)) }
            else {
                // Same key for every retry of this draft; the server returns the first message.
                body["clientId"] = .str(sendKey.value)
                if live.connected { try await live.send(.object(body)) }
                else { _ = try await APIClient.shared.call("POST", "/api/social/messages", .object(body)) }
            }
            bodyText = ""; attachment = .null; sendKey.reset(); await reload()
        }
    }
}

struct ChannelEditor: View {
    @EnvironmentObject private var store: AppStore
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
            if store.managing {
                Field(key: "social.channelName", value: $name)
                Tabs(options: [("CHAT", "social.chat"), ("TIMELINE", "social.timeline")], selection: $kind)
                Picker(L.t("social.visibility"), selection: $visibility) { Text(L.status("MEMBERS")).tag("MEMBERS"); Text(L.status("ADMINS_ONLY")).tag("ADMINS_ONLY") }
                Picker(L.t("social.posting"), selection: $posting) {
                    Text(L.t("common.notSet")).tag("default"); Text(L.t("common.yes")).tag("yes"); Text(L.t("common.no")).tag("no")
                }
                Toggle(L.t("social.archived"), isOn: $archived)
                MutationState(mutation: mutation)
                Button(L.t("common.save")) {
                    Task { await mutation.run {
                        guard store.managing else { return }
                        var body: [String: JSON] = ["cityId": .str(cityID), "name": .str(name), "kind": .str(kind), "visibility": .str(visibility), "memberPosting": posting == "default" ? .null : .bool(posting == "yes"), "archived": .bool(archived)]
                        if channel.exists { body["id"] = .str(channel.id) }
                        _ = try await APIClient.shared.call("POST", "/api/social/channels", .object(body)); dismiss()
                    } }
                }.buttonStyle(PATSButtonStyle(loading: mutation.busy)).disabled(mutation.busy || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || name.count > 80)
            } else { Notice(text: L.t("ux.social.adminModeRequired")) }
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
    @StateObject private var origin = Resource()
    @StateObject private var mutation = Mutation()
    var body: some View {
        DataPage(title: "social.roaming", path: "/api/events?scope=all") { data, _ in
            if store.member.exists {
                Notice(text: L.t("social.roamingHint"))
                let eligible = data["upcoming"].rows.filter { $0["city"].id != store.member["city"].id }
                let selected = eligible.first { $0.id == eventID }
                if !eventID.isEmpty && selected == nil {
                    Panel {
                        Text(origin.data["event"]["title"].text.isEmpty ? L.t("ux.social.originEvent") : origin.data["event"]["title"].text).font(Theme.title(17))
                        Notice(text: L.t("ux.social.roamingUnavailable"))
                    }
                }
                if eligible.isEmpty { EmptyState(title: "ux.social.noVisitingEvents", message: "ux.social.noVisitingEventsBody", icon: "globe.asia.australia") }
                Choice(label: "social.event", options: pickerOptions(eligible), selection: $eventID, allowEmpty: true, autoSelect: false)
                if let selected {
                    Panel {
                        Text(selected["title"].text).font(Theme.title(17))
                        Text(selected["city"]["name"].text + " · " + L.date(selected["startsAt"].text, zone: selected["city"]["timezone"].text)).foregroundStyle(Theme.muted)
                    }
                }
                Picker(L.t("social.kind"), selection: $kind) { Text(L.status("ATTENDANCE")).tag("ATTENDANCE"); Text(L.status("SOCIAL_HUB")).tag("SOCIAL_HUB") }
                ConfirmAction(label: "social.requestRoaming", message: L.t("ux.social.roamingConfirm", ["event": selected?["title"].text ?? "", "city": selected?["city"]["name"].text ?? "", "type": L.status(kind)]), disabled: selected == nil || mutation.busy) {
                    guard store.member.exists, selected != nil else { return }
                    await mutation.send("/api/social/roaming", body: .object(["eventId": .str(eventID), "type": .str(kind)]))
                }
                MutationState(mutation: mutation)
                NavigationRow(title: "social.review", icon: "list.bullet") { SocialOperationsView(initialSection: "roaming") }
            } else { EmptyState(title: "ux.social.memberRequestsOnly", message: "ux.social.staffContext", icon: "person.crop.circle") }
        }.task {
            // Preserve the caller's event even when it is no longer in the eligible list.
            if eventID.isEmpty { eventID = initialEventID }
            if !initialEventID.isEmpty { await origin.load("/api/events/\(initialEventID)") }
        }
    }
    private func pickerOptions(_ eligible: [JSON]) -> [JSON] {
        guard !eventID.isEmpty, !eligible.contains(where: { $0.id == eventID }) else { return eligible }
        let title = origin.data["event"]["title"].text
        return [.object(["id": .str(eventID), "name": .str((title.isEmpty ? L.t("ux.social.originEvent") : title) + " · " + L.t("ux.social.unavailable"))])] + eligible
    }
}
struct ReservationView: View {
    let eventID: String
    @EnvironmentObject private var store: AppStore
    @State private var slot = ""
    @State private var pax = "1"
    @State private var note = ""
    @StateObject private var event = Resource()
    @StateObject private var mutation = Mutation()
    var body: some View {
        DataPage(title: "social.reserve", path: query("/api/social/slots", ["eventId": eventID])) { data, reload in
            if store.member.exists {
                Text(data["eventTitle"].text).font(Theme.title(20)); Text(data["venueName"].text).foregroundStyle(Theme.muted)
                EventPosterHighlight(event: event.data["event"])
                ResourceState(resource: event) { await event.load("/api/events/\(eventID)") }
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
                    guard store.member.exists else { return }
                    await mutation.run {
                        let result = try await APIClient.shared.call("POST", "/api/social/reserve", .object(["eventId": .str(eventID), "slotCode": .str(slot), "pax": .num(Int(pax) ?? 1), "note": .str(note)]))
                        await reload(); if !result["conversationId"].text.isEmpty { store.link = .conversation(result["conversationId"].text) }
                    }
                }
            } else { EmptyState(title: "ux.social.memberRequestsOnly", message: "ux.social.staffContext", icon: "person.crop.circle") }
        }.task(id: eventID) { await event.load("/api/events/\(eventID)") }
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
                    Button(code) { selection = code }.buttonStyle(.plain)
                        .font(Theme.body(11)).foregroundStyle(selection == code ? Theme.color("primaryText") : Theme.text)
                        .frame(width: geometry.size.width * CGFloat(s["w"].int)/12 - 2, height: geometry.size.height * CGFloat(s["h"].int)/12 - 2)
                        .background(taken.contains(code) ? Theme.border : selection == code ? Theme.color("primary") : Theme.color("accentSubtle"), in: RoundedRectangle(cornerRadius: Theme.controlRadius))
                        .offset(x: geometry.size.width * CGFloat(s["x"].int)/12, y: geometry.size.height * CGFloat(s["y"].int)/12)
                        .disabled(taken.contains(code)).accessibilityLabel(code + ", " + L.status(s["kind"].text) + ", " + s["pax"].text)
                }
            }.clipShape(RoundedRectangle(cornerRadius: Theme.controlRadius))
        }.aspectRatio(1, contentMode: .fit).accessibilityHidden(true)
    }
}
