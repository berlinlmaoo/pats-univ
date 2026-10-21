import SwiftUI

/// Requests keep their own filters and empty states; staff actions additionally require Admin mode.
struct SocialOperationsView: View {
    var initialSection = "reservations"
    var eventID = ""
    @EnvironmentObject private var store: AppStore
    @State private var section = "reservations"
    @StateObject private var mutation = Mutation()
    var body: some View {
        DataPage(title: store.managing ? "social.operations" : "ux.social.myRequests", path: "/api/social/operations", poll: true) { data, reload in
            let reservations = scoped(data["reservations"].rows)
            let roaming = scoped(data["roaming"].rows)
            if !store.member.exists && !store.managing {
                EmptyState(title: "ux.social.memberRequestsOnly", message: "ux.social.staffContext", icon: "person.crop.circle")
            } else {
                MutationState(mutation: mutation)
                if !eventID.isEmpty {
                    let event = (reservations + roaming).first?["event"] ?? .null
                    Notice(text: L.t("ux.social.eventScope", ["event": event["title"].text.isEmpty ? L.t("events.details") : event["title"].text]))
                }
                Tabs(options: sections, selection: $section, counts: [
                    "reservations": reservations.filter { $0["status"].text == "PENDING" || ($0["status"].text == "CONFIRMED" && !$0["downPaymentAt"].exists) }.count,
                    "roaming": roaming.filter { $0["status"].text == "PENDING" }.count,
                    "moderation": data["muted"].rows.count
                ])
                if section == "reservations" {
                    ReservationQueue(rows: reservations, mutation: mutation, reload: reload)
                } else if section == "roaming" {
                    RoamingQueue(rows: roaming, mutation: mutation, reload: reload)
                } else if store.managing {
                    CommunityModerationQueue(data: data, mutation: mutation, reload: reload)
                }
            }
        }
        .onAppear { section = initialSection == "moderation" && !store.managing ? "reservations" : initialSection }
        .onChange(of: store.managing) { _, managing in if !managing && section == "moderation" { section = "reservations" } }
    }
    private var sections: [(String, String)] {
        var values = [("reservations", "social.reservations"), ("roaming", "ux.social.visitingAccess")]
        if store.managing { values.append(("moderation", "ux.social.moderation")) }
        return values
    }
    private func scoped(_ rows: [JSON]) -> [JSON] {
        rows.filter { row in
            let belongsToEvent = eventID.isEmpty || row["eventId"].text == eventID || row["event"].id == eventID
            let belongsToMember = store.managing || (store.member.exists && row["memberId"].text == store.member.id)
            return belongsToEvent && belongsToMember
        }
    }
}

private struct ReservationQueue: View {
    let rows: [JSON]
    @ObservedObject var mutation: Mutation
    var reload: () async -> Void
    @State private var status = "all"
    @State private var search = ""
    @EnvironmentObject private var store: AppStore
    private var filtered: [JSON] {
        rows.filter { row in
            let matchesStatus: Bool
            if status == "unpaid" { matchesStatus = row["status"].text == "CONFIRMED" && !row["downPaymentAt"].exists }
            else { matchesStatus = status == "all" || row["status"].text == status }
            let content = row["event"]["title"].text + " " + row["member"]["fullName"].text + " " + row["slotCode"].text
            return matchesStatus && (search.isEmpty || content.localizedCaseInsensitiveContains(search))
        }
    }
    var body: some View {
        Text(L.t("ux.social.reservationCounts", ["pending": L.count(rows.filter { $0["status"].text == "PENDING" }.count), "unpaid": L.count(rows.filter { $0["status"].text == "CONFIRMED" && !$0["downPaymentAt"].exists }.count)])).font(Theme.body(13)).foregroundStyle(Theme.muted)
        Field(key: "ux.social.searchRequests", value: $search)
        Picker(L.t("ux.social.filter"), selection: $status) {
            Text(L.t("ux.social.allRecords")).tag("all")
            Text(L.status("PENDING")).tag("PENDING")
            Text(L.t("ux.social.awaitingDeposit")).tag("unpaid")
            ForEach(["CONFIRMED", "REJECTED", "CANCELLED"], id: \.self) { Text(L.status($0)).tag($0) }
        }.pickerStyle(.menu)
        if filtered.isEmpty {
            EmptyState(title: rows.isEmpty ? "ux.social.noReservations" : "ux.social.noMatches", message: rows.isEmpty ? "ux.social.noReservationsBody" : "ux.social.noMatchesBody", icon: "list.bullet.rectangle")
        }
        ForEach(filtered) { row in ReservationOperationCard(row: row, mutation: mutation, reload: reload) }
    }
}

private struct ReservationOperationCard: View {
    let row: JSON
    @ObservedObject var mutation: Mutation
    var reload: () async -> Void
    @EnvironmentObject private var store: AppStore
    private var canManage: Bool { store.managing && store.can("reservation.manage") && row["canDecide"].bool }
    private var canCancel: Bool {
        ["PENDING", "CONFIRMED"].contains(row["status"].text) &&
        (canManage || (store.member.exists && row["memberId"].text == store.member.id))
    }
    private var confirmation: String {
        L.t("ux.social.reservationDecision", ["event": row["event"]["title"].text, "slot": row["slotCode"].text, "member": row["member"]["fullName"].text])
    }
    var body: some View {
        Panel {
            ReservationEventContext(event: row["event"], eventID: row["eventId"].text)
            Text(row["event"]["title"].text + " · " + row["slotCode"].text).font(Theme.title(17))
            if !row["event"]["city"]["name"].text.isEmpty { Text(row["event"]["city"]["name"].text).foregroundStyle(Theme.muted) }
            Text(row["member"]["fullName"].text + " · " + L.count(row["pax"].int))
            Badge(value: row["status"].text)
            if !row["note"].text.isEmpty { Text(row["note"].text) }
            if row["minimumCharge"].exists { Text(L.t("phase5.minimumCharge") + ": " + L.money(row["minimumCharge"].int)) }
            if row["downPaymentAt"].exists {
                Label(L.t("ux.social.depositRecorded", ["amount": L.money(row["downPaymentAmount"].int)]), systemImage: "checkmark.circle.fill")
                Text(L.date(row["downPaymentAt"].text)).font(Theme.body(13)).foregroundStyle(Theme.muted)
            } else {
                Badge(value: "unpaid")
                if ["PENDING", "CONFIRMED"].contains(row["status"].text) {
                    Notice(text: L.t(row["status"].text == "PENDING" ? "ux.social.depositAfterConfirmation" : "ux.social.depositNextStep"))
                }
                if canManage && row["status"].text == "CONFIRMED" {
                    NavigationRow(title: "ux.social.recordDeposit", icon: "banknote") { ReservationDepositView(reservation: row, reload: reload) }
                }
            }
            if row["conversation"].exists {
                NavigationRow(title: "social.chat", subtitle: L.t("ux.social.depositChat"), icon: "bubble.left") { ChannelView(room: Room(kind: "conversation", id: row["conversation"].id)) }
            }
            if canManage && row["status"].text == "PENDING" {
                decision("social.confirm", status: "CONFIRMED")
                decision("social.reject", status: "REJECTED")
            }
            if canCancel { decision("social.cancelReservation", status: "CANCELLED") }
        }
    }
    private func decision(_ key: String, status: String) -> some View {
        ConfirmAction(label: key, message: confirmation, destructive: status == "CANCELLED", disabled: mutation.busy) {
            guard status == "CANCELLED" ? canCancel : canManage else { return }
            await mutation.send("/api/social/reservation-decision", body: .object(["id": .str(row.id), "status": .str(status)]), after: reload)
        }
    }
}

/// Operations may receive a compact event summary. Fetch the same published poster used in Events.
private struct ReservationEventContext: View {
    let event: JSON
    let eventID: String
    @StateObject private var detail = Resource()
    private var complete: Bool { event["description"].exists && (event["posterUrl"].exists || event["flyerUrl"].exists) }
    var body: some View {
        EventPosterHighlight(event: complete ? event : detail.data["event"])
        if !complete && detail.error != nil { ResourceState(resource: detail) { await load() } }
        Color.clear.frame(height: 0).task(id: eventID) { if !complete { await load() } }
    }
    private func load() async {
        let id = eventID.isEmpty ? event.id : eventID
        if !id.isEmpty { await detail.load("/api/events/\(id)") }
    }
}

private struct ReservationDepositView: View {
    let reservation: JSON
    var reload: () async -> Void
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @StateObject private var mutation = Mutation()
    @State private var amount = ""
    private var validAmount: Int? {
        guard let value = Int(amount), value >= 1 && value <= 2_000_000_000 else { return nil }
        return value
    }
    var body: some View {
        Page(title: "ux.social.recordDeposit") {
            if store.managing && store.can("reservation.manage") {
                Panel {
                    Text(reservation["event"]["title"].text).font(Theme.title(20))
                    Text(reservation["slotCode"].text + " · " + reservation["member"]["fullName"].text)
                    Notice(text: L.t("ux.social.receivedOutsideApp"))
                    Field(key: "ux.social.depositAmount", value: $amount, keyboard: .numberPad)
                    if !amount.isEmpty && validAmount == nil { Notice(text: L.t("ux.social.invalidAmount"), error: true) }
                    if let value = validAmount { Text(L.money(value)).fontWeight(.semibold) }
                    MutationState(mutation: mutation)
                    ConfirmAction(label: "ux.social.recordDeposit", message: L.t("ux.social.depositConfirm", ["amount": L.money(validAmount ?? 0), "member": reservation["member"]["fullName"].text, "event": reservation["event"]["title"].text, "slot": reservation["slotCode"].text]), disabled: mutation.busy || validAmount == nil) {
                        guard store.managing, store.can("reservation.manage"), let value = validAmount else { return }
                        store.operationInProgress = true
                        defer { store.operationInProgress = false }
                        await mutation.run {
                            _ = try await APIClient.shared.call("POST", "/api/admin/payments", .object(["kind": .str("reservation"), "id": .str(reservation.id), "amount": .num(value)]))
                            await reload(); dismiss()
                        }
                    }
                }
            } else { Notice(text: L.t("ux.social.adminModeRequired")) }
        }
    }
}

private struct RoamingQueue: View {
    let rows: [JSON]
    @ObservedObject var mutation: Mutation
    var reload: () async -> Void
    @EnvironmentObject private var store: AppStore
    @State private var status = "all"
    @State private var kind = "all"
    @State private var search = ""
    private var filtered: [JSON] {
        rows.filter { row in
            let content = row["event"]["title"].text + " " + row["member"]["fullName"].text
            return (status == "all" || row["status"].text == status) && (kind == "all" || row["type"].text == kind) &&
            (search.isEmpty || content.localizedCaseInsensitiveContains(search))
        }
    }
    var body: some View {
        Text(L.t("ux.social.pendingCount", ["count": L.count(rows.filter { $0["status"].text == "PENDING" }.count)])).font(Theme.body(13)).foregroundStyle(Theme.muted)
        Field(key: "ux.social.searchRequests", value: $search)
        Picker(L.t("ux.social.filter"), selection: $status) {
            Text(L.t("ux.social.allRecords")).tag("all")
            ForEach(["PENDING", "APPROVED", "REJECTED", "EXPIRED"], id: \.self) { Text(L.status($0)).tag($0) }
        }.pickerStyle(.menu)
        Picker(L.t("social.kind"), selection: $kind) {
            Text(L.t("ux.social.allTypes")).tag("all")
            Text(L.status("ATTENDANCE")).tag("ATTENDANCE")
            Text(L.status("SOCIAL_HUB")).tag("SOCIAL_HUB")
        }.pickerStyle(.menu)
        if filtered.isEmpty { EmptyState(title: rows.isEmpty ? "ux.social.noRoaming" : "ux.social.noMatches", message: rows.isEmpty ? "ux.social.noRoamingBody" : "ux.social.noMatchesBody", icon: "globe.asia.australia") }
        ForEach(filtered) { row in
            Panel {
                Text(row["member"]["fullName"].text + " · " + row["event"]["title"].text).fontWeight(.semibold)
                Badge(value: row["status"].text)
                Text(L.status(row["type"].text))
                if row["accessExpiresAt"].exists { Text(L.t("ux.social.accessUntil", ["date": L.date(row["accessExpiresAt"].text)])) }
                if row["status"].text == "PENDING" && canDecide(row) {
                    decision("social.approve", value: "APPROVED", row: row)
                    decision("social.reject", value: "REJECTED", row: row)
                }
            }
        }
    }
    private func canDecide(_ row: JSON) -> Bool {
        store.managing && (row["type"].text == "ATTENDANCE" ? store.can("city.operations") : store.can("hq.manage"))
    }
    private func decision(_ key: String, value: String, row: JSON) -> some View {
        ConfirmAction(label: key, message: L.t("ux.social.roamingDecision", ["event": row["event"]["title"].text, "member": row["member"]["fullName"].text, "type": L.status(row["type"].text)]), disabled: mutation.busy) {
            guard canDecide(row) else { return }
            await mutation.send("/api/social/roaming-decision", body: .object(["id": .str(row.id), "decision": .str(value)]), after: reload)
        }
    }
}

private struct CommunityModerationQueue: View {
    let data: JSON
    @ObservedObject var mutation: Mutation
    var reload: () async -> Void
    @EnvironmentObject private var store: AppStore
    @State private var category = "muted"
    @State private var search = ""
    private var rows: [JSON] {
        data[category].rows.filter { search.isEmpty || $0["name"].text.localizedCaseInsensitiveContains(search) }
    }
    var body: some View {
        if store.managing {
            Tabs(options: [("muted", "social.muted"), ("screenshots", "social.screenshots")], selection: $category, counts: ["muted": data["muted"].rows.count, "screenshots": data["screenshots"].rows.count])
            Text(L.t("ux.social.recordCount", ["count": L.count(data[category].rows.count)])).font(Theme.body(13)).foregroundStyle(Theme.muted)
            Field(key: "ux.social.searchMember", value: $search)
            if rows.isEmpty {
                EmptyState(title: data[category].rows.isEmpty ? (category == "muted" ? "ux.social.noMuted" : "ux.social.noScreenshots") : "ux.social.noMatches", message: data[category].rows.isEmpty ? (category == "muted" ? "ux.social.noMutedBody" : "ux.social.noScreenshotsBody") : "ux.social.noMatchesBody", icon: category == "muted" ? "speaker.slash" : "camera")
            }
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                Panel {
                    Text(row["name"].text).fontWeight(.semibold)
                    if category == "screenshots" { Text(L.t("ux.social.screenshotCount", ["count": L.count(row["count"].int)])) }
                    else {
                        ConfirmAction(label: "social.unmute", message: L.t("ux.social.unmuteConfirm", ["member": row["name"].text]), disabled: mutation.busy) {
                            guard store.managing else { return }
                            await mutation.send("/api/social/moderate", body: .object(["action": .str("mute"), "cityId": row["cityId"], "userId": row["userId"], "muted": .bool(false)]), after: reload)
                        }
                    }
                }
            }
        }
    }
}
