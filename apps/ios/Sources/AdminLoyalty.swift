import SwiftUI

struct RewardValidationView: View {
    @State private var eventID = ""
    @State private var code = ""
    @State private var preview: JSON = .null
    @State private var camera = false
    @StateObject private var mutation = Mutation()
    var body: some View {
        DataPage(title: "loyalty.validateReward", path: "/api/admin/loyalty/operations") { data, _ in
            Choice(label: "loyalty.event", options: data["events"].rows, selection: $eventID).onChange(of: eventID) { _, _ in preview = .null }
            Field(key: "loyalty.code", value: $code).textInputAutocapitalization(.characters).autocorrectionDisabled().onChange(of: code) { _, v in code = String(v.uppercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber) }.prefix(6)); preview = .null }
            Button(L.t("loyalty.lookup")) { Task { await lookup(code) } }.buttonStyle(PATSButtonStyle()).disabled(mutation.busy || code.count != 6 || eventID.isEmpty)
            Button(L.t("loyalty.scanCode"), systemImage: "qrcode.viewfinder") { camera = true }.buttonStyle(.bordered).disabled(mutation.busy || eventID.isEmpty)
            MutationState(mutation: mutation)
            if preview.exists {
                Panel {
                    Text(preview["reward"]["name"].text).font(Theme.title(20)); MemberIdentity(member: preview["member"])
                    Text(preview["code"].text).font(Theme.title(26)).monospaced(); Badge(value: preview["status"].text)
                    ConfirmAction(label: "loyalty.fulfill", message: preview["reward"]["name"].text + " · " + preview["member"]["fullName"].text, disabled: mutation.busy) {
                        await mutation.run {
                            _ = try await APIClient.shared.call("POST", "/api/admin/loyalty/codes/fulfill", .object(["eventId": .str(eventID), "code": preview["code"]]))
                            preview = .null; code = ""; mutation.message = L.t("loyalty.fulfilled")
                        }
                    }
                }
            }
        }.sheet(isPresented: $camera) { ScannerSheet { value in code = value; Task { await lookup(value) } } }
    }
    private func lookup(_ value: String) async {
        await mutation.run {
            preview = .null
            preview = try await APIClient.shared.call("POST", "/api/admin/loyalty/codes/preview", .object(["eventId": .str(eventID), "code": .str(value.uppercased())]))["redemption"]
        }
    }
}
struct ClaimsReviewView: View {
    var body: some View {
        DataPage(title: "phase5.claimReview", path: "/api/admin/loyalty/claims", poll: true) { data, reload in
            if data["claims"].rows.isEmpty { EmptyState(title: "phase5.claimEmpty", icon: "doc.text") }
            ForEach(data["claims"].rows) { claim in ClaimReviewCard(claim: claim, reload: reload).id(claim.id + claim["status"].text) }
        }
    }
}
struct ClaimReviewCard: View {
    let claim: JSON
    let reload: () async -> Void
    @State private var guests = "0"
    @State private var reservations = "0"
    @State private var reason = ""
    @StateObject private var mutation = Mutation()
    private var valid: Bool { (Int(guests).map { (0...1_000_000).contains($0) } ?? false) && (Int(reservations).map { (0...1_000_000).contains($0) } ?? false) }
    var body: some View {
        Panel {
            ClaimSummary(claim: claim)
            if !claim["receiptUrl"].text.isEmpty { PrivateReceiptButton(path: "/api/loyalty/claims/\(claim.id)/receipt?format=json") }
            if claim["status"].text == "PENDING" {
                Text(L.t("phase5.claimAdjustHint")).font(Theme.body(13)).foregroundStyle(Theme.muted)
                Field(key: "phase5.guestCount", value: $guests, keyboard: .numberPad)
                Field(key: "phase5.reservationCount", value: $reservations, keyboard: .numberPad)
                Field(key: "phase5.reason", value: $reason)
                ConfirmAction(label: "phase5.approve", message: L.t("phase5.claimApproveConfirm"), disabled: mutation.busy || !valid) { await decide("APPROVED") }
                ConfirmAction(label: "phase5.reject", message: reason, destructive: true, disabled: mutation.busy || !valid || reason.trimmingCharacters(in: .whitespacesAndNewlines).count < 3) { await decide("REJECTED") }
            }
            MutationState(mutation: mutation)
        }.onAppear { guests = claim["guestCount"].text; reservations = claim["reservationCount"].text }
    }
    private func decide(_ decision: String) async {
        await mutation.send("/api/admin/loyalty/claims", body: .object(["id": .str(claim.id), "decision": .str(decision), "guestCount": .num(Int(guests) ?? 0), "reservationCount": .num(Int(reservations) ?? 0), "reason": .str(reason)]), after: reload)
    }
}
struct CrewOperationsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var eventID = ""
    @State private var search = ""
    @StateObject private var mutation = Mutation()
    var body: some View {
        DataPage(title: "loyalty.operations", path: "/api/admin/loyalty/operations") { data, reload in
            Panel {
                ForEach(["members", "checkIns", "fulfilled", "revenue"], id: \.self) { key in
                    Text(L.t("loyalty.\(key == "fulfilled" ? "fulfilledCount" : key)") + ": " + (key == "revenue" ? L.money(data["stats"][key].int) : L.count(data["stats"][key].int)))
                }
                NavigationRow(title: "phase5.claimReview", icon: "doc.text") { ClaimsReviewView() }
            }
            Text(L.t("loyalty.recap")).font(Theme.title(20))
            Choice(label: "loyalty.event", options: data["events"].rows, selection: $eventID)
            if let event = data["events"].rows.first(where: { $0.id == eventID }) {
                RecapEditor(eventID: eventID, recap: event["recap"], reload: reload).id(eventID + event["recap"]["lockedAt"].text)
            }
            Text(L.t("loyalty.promoterFlag")).font(Theme.title(20))
            Field(key: "native.search", value: $search)
            MutationState(mutation: mutation)
            ForEach(data["members"].rows.filter { search.isEmpty || ($0["fullName"].text + " " + $0["nim"].text).localizedCaseInsensitiveContains(search) }.prefix(30)) { m in
                Panel {
                    Text(m["fullName"].text + " · " + m["nim"].text)
                    if store.can("promoter.manage") {
                        ConfirmAction(label: m["isPromoter"].bool ? "loyalty.removePromoter" : "loyalty.grantPromoter", message: m["fullName"].text, disabled: mutation.busy) {
                            await mutation.send("/api/admin/loyalty/promoters/\(m.id)", body: .object(["enabled": .bool(!m["isPromoter"].bool)]), after: reload)
                        }
                    }
                }
            }
            Text(L.t("loyalty.promoter")).font(Theme.title(20))
            if data["reports"].rows.isEmpty { EmptyState(title: "loyalty.emptyReports", message: "loyalty.emptyReportsBody") }
            ForEach(data["reports"].rows) { report in
                Panel {
                    Text(report["member"]["fullName"].text).font(Theme.title(17)); Text(report["event"]["title"].text)
                    Badge(value: report["status"].text)
                    Text(L.count(report["guestCount"].int) + " · " + L.t("loyalty.guestCount"))
                    if report["receiptAmount"].exists { Text(L.money(report["receiptAmount"].int)) }
                    if !report["receiptUrl"].text.isEmpty { PrivateReceiptButton(path: "/api/loyalty/receipts/\(report.id)?format=json") }
                    if report["bonusKind"].exists { Text(report["bonusKind"].text == "CASH" ? L.money(report["bonusValue"].int) : L.count(report["bonusValue"].int) + " XP") }
                    Text(report["rejectReason"].text)
                    ForEach(report["payouts"].rows) { p in Text(L.money(p["amount"].int) + " · " + L.status(p["status"].text)) }
                }
            }
        }
    }
}
struct RecapEditor: View {
    let eventID: String
    let recap: JSON
    let reload: () async -> Void
    @State private var values: [String: String] = [:]
    @StateObject private var mutation = Mutation()
    private let counts = ["sofaCount", "tableCount", "fdcCount", "paxCount", "revenueSofa", "revenueTable", "revenueFdc"]
    var body: some View {
        Panel {
            if recap.exists { Text(L.t("loyalty.total") + ": " + L.money(recap["total"].int)).font(Theme.title(20)) }
            if recap["lockedAt"].exists { Notice(text: L.t("loyalty.locked")) }
            ForEach(counts, id: \.self) { key in Field(key: "loyalty.\(key)", value: binding(key), keyboard: .numberPad).disabled(recap["lockedAt"].exists) }
            Field(key: "phase5.personInCharge", value: binding("personInCharge")).disabled(recap["lockedAt"].exists)
            Field(key: "phase5.accountablePerson", value: binding("accountablePerson")).disabled(recap["lockedAt"].exists)
            Field(key: "loyalty.note", value: binding("note")).disabled(recap["lockedAt"].exists)
            MutationState(mutation: mutation)
            if !recap["lockedAt"].exists {
                Button(L.t("common.save")) {
                    Task {
                        var body: [String: JSON] = ["eventId": .str(eventID)]
                        for key in counts { body[key] = .num(Int(binding(key).wrappedValue) ?? 0) }
                        for key in ["personInCharge", "accountablePerson", "note"] { body[key] = .str(binding(key).wrappedValue) }
                        await mutation.send("/api/admin/loyalty/recaps", body: .object(body), after: reload)
                    }
                }.buttonStyle(PATSButtonStyle()).disabled(mutation.busy || !valid)
            }
        }
    }
    private func binding(_ key: String) -> Binding<String> {
        Binding(get: { values[key] ?? (recap[key].exists ? recap[key].text : counts.contains(key) ? "0" : "") }, set: { values[key] = $0 })
    }
    private var valid: Bool {
        counts.allSatisfy { key in Int(binding(key).wrappedValue).map { (0...(key.hasPrefix("revenue") ? 2_000_000_000 : 1_000_000)).contains($0) } ?? false }
        && ["personInCharge", "accountablePerson"].allSatisfy { !binding($0).wrappedValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        && binding("note").wrappedValue.count <= 2000
    }
}
