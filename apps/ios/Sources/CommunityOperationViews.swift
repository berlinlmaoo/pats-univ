import SwiftUI

/// Requests keep their own filters and empty states; staff actions additionally require Admin mode.
struct SocialOperationsView: View {
    var initialSection = "reservations"
    var eventID = ""
    var initialReservationID = ""
    var initialRequestID = ""
    var personal = false
    @EnvironmentObject private var store: AppStore
    @State private var section = "reservations"
    @StateObject private var mutation = Mutation()
    @StateObject private var context = Resource()
    private var managing: Bool { store.managing && !personal }
    private var contextPath: String { eventID.isEmpty ? "" : "/api/\(managing ? "admin/" : "")events/\(eventID)" }
    var body: some View {
        // Observe the selection here, outside DataPage's escaping content builder.
        let selectedSection = section
        DataPage(title: managing ? "social.operations" : "ux.social.myRequests", path: query("/api/social/operations", ["eventId": eventID]), poll: true, eventContext: context.data["event"]) { data, reload in
            let reservations = scoped(data["reservations"].rows)
            let roaming = scoped(data["roaming"].rows)
            let counts = queueCounts(data, reservations: reservations, roaming: roaming)
            if !store.member.exists && !managing {
                EmptyState(title: "ux.social.memberRequestsOnly", message: "ux.social.staffContext", icon: "person.crop.circle")
            } else {
                MutationState(mutation: mutation)
                if !eventID.isEmpty {
                    ResourceState(resource: context) { await loadContext() }
                    let event = (reservations + roaming).first?["event"] ?? .null
                    Notice(text: L.t("ux.social.eventScope", ["event": event["title"].text.isEmpty ? L.t("events.details") : event["title"].text]))
                }
                Tabs(options: sections, selection: $section, counts: [
                    "reservations": counts["reservationsPending"].int,
                    "roaming": counts["roamingPending"].int,
                    "moderation": data["muted"].rows.count
                ])
                if selectedSection == "reservations" {
                    ReservationQueue(rows: focused(reservations, id: initialReservationID), focusID: initialReservationID, managing: managing, pending: counts["reservationsPending"].int, unpaid: counts["depositsUnpaid"].int, mutation: mutation, reload: reload)
                } else if selectedSection == "roaming" {
                    RoamingQueue(rows: focused(roaming, id: initialRequestID), focusID: initialRequestID, managing: managing, pending: counts["roamingPending"].int, mutation: mutation, reload: reload)
                } else if managing {
                    CommunityModerationQueue(data: data, mutation: mutation, reload: reload)
                }
            }
        }
        .task(id: contextPath) { context.data = .null; await loadContext() }
        .onAppear { section = !initialRequestID.isEmpty ? "roaming" : initialSection == "moderation" && !managing ? "reservations" : initialSection }
        .onChange(of: managing) { _, managing in if !managing && section == "moderation" { section = "reservations" } }
    }
    private func focused(_ rows: [JSON], id: String) -> [JSON] {
        guard !id.isEmpty else { return rows }
        return rows.filter { $0.id == id } + rows.filter { $0.id != id }
    }
    private func loadContext() async {
        guard !contextPath.isEmpty else { return }
        await context.load(contextPath)
    }
    private var sections: [(String, String)] {
        var values = [("reservations", "social.reservations"), ("roaming", "ux.social.visitingAccess")]
        if managing { values.append(("moderation", "ux.social.moderation")) }
        return values
    }
    private func queueCounts(_ data: JSON, reservations: [JSON], roaming: [JSON]) -> JSON {
        // Staff personal presentation must not show counts for other members in the crew scope.
        if data["counts"].exists && (managing || !store.admin) { return data["counts"] }
        return .object([
            "reservationsPending": .num(reservations.filter { $0["status"].text == "PENDING" }.count),
            "depositsUnpaid": .num(reservations.filter(ReservationPresentation.blocksBooking).count),
            "roamingPending": .num(roaming.filter { $0["status"].text == "PENDING" }.count)
        ])
    }
    private func scoped(_ rows: [JSON]) -> [JSON] {
        rows.filter { row in
            let belongsToEvent = eventID.isEmpty || row["eventId"].text == eventID || row["event"].id == eventID
            let belongsToMember = managing || (store.member.exists && row["memberId"].text == store.member.id)
            return belongsToEvent && belongsToMember
        }
    }
}

private struct ReservationQueue: View {
    let rows: [JSON]
    let focusID: String
    let managing: Bool
    let pending: Int
    let unpaid: Int
    @ObservedObject var mutation: Mutation
    var reload: () async -> Void
    @State private var status = "all"
    @State private var search = ""
    @EnvironmentObject private var store: AppStore
    private var filtered: [JSON] {
        rows.filter { row in
            let matchesStatus: Bool
            if status == "unpaid" { matchesStatus = ReservationPresentation.blocksBooking(row) }
            else { matchesStatus = status == "all" || row["status"].text == status }
            let content = row["event"]["title"].text + " " + row["member"]["fullName"].text + " " + row["slotCode"].text
            return matchesStatus && (search.isEmpty || content.localizedCaseInsensitiveContains(search))
        }
    }
    var body: some View {
        Text(L.t("ux.social.reservationCounts", ["pending": L.count(pending), "unpaid": L.count(unpaid)])).font(Theme.body(13)).foregroundStyle(Theme.muted)
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
        ForEach(filtered) { row in
            ReservationOperationCard(row: row, managing: managing, mutation: mutation, reload: reload)
                .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(row.id == focusID ? Theme.accent : .clear, lineWidth: 2))
        }
    }
}

private struct ReservationOperationCard: View {
    let row: JSON
    let managing: Bool
    @ObservedObject var mutation: Mutation
    var reload: () async -> Void
    @EnvironmentObject private var store: AppStore
    private var canManage: Bool { managing && store.can("reservation.manage") && row["canDecide"].bool }
    private var canRecord: Bool { managing && store.can("reservation.manage") && row["canRecordDeposit"].bool }
    private var conversationID: String { row["conversationId"].text.isEmpty ? row["conversation"].id : row["conversationId"].text }
    private var payment: JSON { row["payment"] }
    private var paid: Bool { payment.exists ? payment["paid"].bool : row["downPaymentAt"].exists }
    private var canCancel: Bool {
        ["PENDING", "CONFIRMED"].contains(row["status"].text) &&
        (canManage || (store.member.exists && row["memberId"].text == store.member.id))
    }
    private var confirmation: String {
        L.t("ux.social.reservationDecision", ["event": row["event"]["title"].text, "slot": row["slotCode"].text, "member": row["member"]["fullName"].text])
    }
    var body: some View {
        Panel {
            EventPosterHighlight(event: ReservationPresentation.event(row))
            Text(row["event"]["title"].text + " · " + row["slotCode"].text).font(Theme.title(17))
            if !row["event"]["city"]["name"].text.isEmpty { Text(row["event"]["city"]["name"].text).foregroundStyle(Theme.muted) }
            Text(row["member"]["fullName"].text + " · " + L.count(row["pax"].int))
            Text(row["slotCode"].text + " · " + L.t("ux.reservation.kind." + (row["slotKind"].text.isEmpty ? "OTHER" : row["slotKind"].text)))
            let venueName = row["venueName"].text.isEmpty ? row["venue"]["name"].text : row["venueName"].text
            if !venueName.isEmpty { Text(venueName).foregroundStyle(Theme.muted) }
            Badge(value: row["status"].text)
            if !row["note"].text.isEmpty { Text(row["note"].text) }
            if row["minimumCharge"].exists { Text(L.t("phase5.minimumCharge") + ": " + L.money(row["minimumCharge"].int)) }
            if paid {
                let amount = payment.exists ? payment["amount"].int : row["downPaymentAmount"].int
                let date = payment.exists ? payment["paidAt"].text : row["downPaymentAt"].text
                Label(L.t("ux.social.depositRecorded", ["amount": L.money(amount)]), systemImage: "checkmark.circle.fill")
                Text(L.date(date)).font(Theme.body(13)).foregroundStyle(Theme.muted)
                if !payment["recordedBy"].text.isEmpty { Text(L.t("ux.social.recordedBy", ["name": payment["recordedBy"].text])).font(Theme.body(13)).foregroundStyle(Theme.muted) }
            } else {
                Badge(value: "unpaid")
                if ReservationPresentation.blocksBooking(row) { Notice(text: L.t("ux.social.depositNextStep")) }
                if canRecord {
                    NavigationRow(title: "ux.social.recordDeposit", icon: "banknote") { ReservationDepositView(reservation: row, reload: reload) }
                }
            }
            if !conversationID.isEmpty {
                NavigationRow(title: "social.chat", subtitle: L.t("ux.social.depositChat"), icon: "bubble.left") { ChannelView(room: Room(kind: "conversation", id: conversationID)) }
            }
            if canManage && row["status"].text == "PENDING" {
                decision("social.confirm", status: "CONFIRMED")
                decision("social.reject", status: "REJECTED")
            }
            if canCancel { decision("social.cancelReservation", status: "CANCELLED") }
        }
    }
    private func decision(_ key: String, status: String) -> some View {
        ConfirmAction(label: key, message: status == "CANCELLED" ? L.t("ux.reservation.cancelConfirm", ["slot": row["slotCode"].text, "event": row["event"]["title"].text]) : confirmation, destructive: status == "CANCELLED", disabled: mutation.busy) {
            guard status == "CANCELLED" ? canCancel : canManage else { return }
            await mutation.send("/api/social/reservation-decision", body: .object(["id": .str(row.id), "status": .str(status)]), after: reload)
        }
    }
}

/// Reservation cards use only the approved poster payload returned by their own endpoint.
enum ReservationPresentation {
    static func event(_ row: JSON) -> JSON {
        var event = row["event"]
        if event.id.isEmpty { event["id"] = row["eventId"] }
        let poster = row["poster"].exists ? row["poster"] : event["poster"]
        if poster.exists {
            event["poster"] = poster
            event["flyerUrl"] = poster["url"]
            event["description"] = poster["description"]
        }
        return event
    }
    static func blocksBooking(_ row: JSON) -> Bool {
        if row["payment"].exists { return row["payment"]["blocksNewBookings"].bool }
        return !row["downPaymentAt"].exists && ["PENDING", "CONFIRMED"].contains(row["status"].text)
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
            if store.managing && store.can("reservation.manage") && reservation["canRecordDeposit"].bool {
                Panel {
                    Text(reservation["event"]["title"].text).font(Theme.title(20))
                    Text(reservation["slotCode"].text + " · " + reservation["member"]["fullName"].text)
                    Notice(text: L.t("ux.social.receivedOutsideApp"))
                    Field(key: "ux.social.depositAmount", value: $amount, keyboard: .numberPad)
                    if !amount.isEmpty && validAmount == nil { Notice(text: L.t("ux.social.invalidAmount"), error: true) }
                    if let value = validAmount { Text(L.money(value)).fontWeight(.semibold) }
                    MutationState(mutation: mutation)
                    ConfirmAction(label: "ux.social.recordDeposit", message: L.t("ux.social.depositConfirm", ["amount": L.money(validAmount ?? 0), "member": reservation["member"]["fullName"].text, "event": reservation["event"]["title"].text, "slot": reservation["slotCode"].text]), disabled: mutation.busy || validAmount == nil) {
                        guard store.managing, store.can("reservation.manage"), reservation["canRecordDeposit"].bool, let value = validAmount else { return }
                        store.operationInProgress = true
                        defer { store.operationInProgress = false }
                        await mutation.run {
                            _ = try await APIClient.shared.call("POST", "/api/admin/reservations/\(reservation.id)/payment", .object(["amount": .num(value)]))
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
    let focusID: String
    let managing: Bool
    let pending: Int
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
        Text(L.t("ux.social.pendingCount", ["count": L.count(pending)])).font(Theme.body(13)).foregroundStyle(Theme.muted)
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
            }.overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(row.id == focusID ? Theme.accent : .clear, lineWidth: 2))
        }
    }
    private func canDecide(_ row: JSON) -> Bool {
        managing && (row["type"].text == "ATTENDANCE" ? store.can("city.operations") : store.can("hq.manage"))
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
