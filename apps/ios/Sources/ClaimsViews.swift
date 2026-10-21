import SwiftUI

struct ClaimsView: View {
    var initialEventID = ""
    var initialClaimID = ""
    @EnvironmentObject private var store: AppStore
    @State private var eventID = ""
    @State private var form = "MEMBER"
    @State private var section = "pending"
    @State private var editing = ""
    @State private var guests = "0"
    @State private var reservations = "0"
    @State private var receipt = ""
    @State private var notes = ""
    @State private var targetInitialized = false
    @StateObject private var mutation = Mutation()
    var body: some View {
        DataPage(title: "ux.claims.bonusTitle", path: "/api/loyalty/claims", room: Room(kind: "wallet", id: store.member.id)) { data, reload in
            let related = data["claims"].rows.first { $0.id == initialClaimID }
            if !initialClaimID.isEmpty {
                Notice(text: L.t(related == nil ? "ux.claim.relatedUnavailable" : "ux.claim.relatedClaim"), error: related == nil)
            }
            Notice(text: L.t("ux.claims.bonusBody"))
            OperationEventContext(events: data["events"].rows, selection: $eventID, fixed: !initialEventID.isEmpty)
                .onChange(of: eventID) { _, _ in if editing.isEmpty || data["claims"].rows.first(where: { $0.id == editing })?["eventId"].text != eventID { clear() } }
            if data["isPromoter"].bool {
                Tabs(options: [("MEMBER", "phase5.claimMember"), ("PR", "phase5.claimPr")], selection: $form)
                    .onChange(of: form) { _, _ in if data["claims"].rows.first(where: { $0.id == editing })?["formType"].text != form { clear() } }
            }
            let existing = data["claims"].rows.first { $0["eventId"].text == eventID && $0["formType"].text == form }
            if !eventID.isEmpty && (existing == nil || existing?.id == editing) {
                Panel {
                    if form == "PR" || data["allowMemberGl"].bool { Field(key: "phase5.guestCount", value: $guests, keyboard: .numberPad) }
                    Field(key: "phase5.reservationCount", value: $reservations, keyboard: .numberPad)
                    Field(key: "phase5.reason", value: $notes)
                    ReceiptCaptureView(key: $receipt)
                    Button(L.t(editing.isEmpty ? "phase5.claimSubmit" : "common.save")) {
                        Task {
                            var body: [String: JSON] = ["eventId": .str(eventID), "formType": .str(form), "reservationCount": .num(Int(reservations) ?? 0), "receiptUrl": .str(receipt), "notes": .str(notes)]
                            if form == "PR" || data["allowMemberGl"].bool { body["guestCount"] = .num(Int(guests) ?? 0) }
                            if !editing.isEmpty { body["id"] = .str(editing) }
                            await mutation.run {
                                _ = try await APIClient.shared.call(editing.isEmpty ? "POST" : "PATCH", "/api/loyalty/claims", .object(body))
                                clear(); await reload(); mutation.message = L.t("phase5.claimPending")
                            }
                        }
                    }.buttonStyle(PATSButtonStyle(loading: mutation.busy)).disabled(mutation.busy || !validCounts)
                    if !editing.isEmpty { Button(L.t("common.cancel")) { clear() } }
                }
            }
            MutationState(mutation: mutation)
                .task(id: initialClaimID + (related?["status"].text ?? "")) {
                    if !targetInitialized, !initialClaimID.isEmpty, let related {
                        section = related["status"].text == "PENDING" ? "pending" : "history"
                        eventID = related["eventId"].text; targetInitialized = true
                    }
                }
            Tabs(options: [("pending", "ktm.pending"), ("history", "ktm.history")], selection: $section, counts: ["pending": data["claims"].rows.filter { $0["status"].text == "PENDING" }.count])
            let matchingRows = data["claims"].rows.filter { ($0["status"].text == "PENDING") == (section == "pending") && (initialEventID.isEmpty || $0["eventId"].text == eventID) }
            let rows = matchingRows.filter { $0.id == initialClaimID } + matchingRows.filter { $0.id != initialClaimID }
            if rows.isEmpty { EmptyState(title: "phase5.claimEmpty") }
            ForEach(rows) { claim in
                Panel {
                    if claim.id == initialClaimID { Label(L.t("ux.claim.relatedClaim"), systemImage: "bell.badge").fontWeight(.semibold) }
                    ClaimSummary(claim: claim)
                    if !claim["receiptUrl"].text.isEmpty { PrivateReceiptButton(path: "/api/loyalty/claims/\(claim.id)/receipt?format=json") }
                    if claim["status"].text == "PENDING" {
                        Button(L.t("common.edit")) {
                            editing = claim.id; eventID = claim["eventId"].text; form = claim["formType"].text
                            guests = claim["guestCount"].text; reservations = claim["reservationCount"].text; receipt = claim["receiptUrl"].text; notes = claim["notes"].text
                        }.buttonStyle(PATSButtonStyle(variant: .secondary))
                    }
                }
            }
        }.onAppear { if !initialEventID.isEmpty { eventID = initialEventID } }
    }
    private var validCounts: Bool { (Int(guests).map { (0...1_000_000).contains($0) } ?? false) && (Int(reservations).map { (0...1_000_000).contains($0) } ?? false) && notes.count <= 2000 }
    private func clear() { editing = ""; guests = "0"; reservations = "0"; receipt = ""; notes = "" }
}
struct ClaimSummary: View {
    let claim: JSON
    var body: some View {
        Text(claim["event"]["title"].text).font(Theme.title(17))
        if !claim["member"]["fullName"].text.isEmpty { Text(claim["member"]["fullName"].text).fontWeight(.semibold) }
        Text(L.t(claim["formType"].text == "PR" ? "phase5.claimPr" : "phase5.claimMember"))
        Badge(value: claim["status"].text)
        Text("\(L.t("phase5.guestCount")): \(L.count(claim["guestCount"].int)) · \(L.t("phase5.reservationCount")): \(L.count(claim["reservationCount"].int))")
        if claim["bonusValue"].exists { Text(L.count(claim["bonusValue"].int) + " XP") }
        if !claim["rejectReason"].text.isEmpty { Notice(text: claim["rejectReason"].text, error: true) }
        if !claim["notes"].text.isEmpty { Text(claim["notes"].text) }
    }
}
