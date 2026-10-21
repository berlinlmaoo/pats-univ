import SwiftUI

/// A fixed workspace event is never silently replaced by a picker default.
struct OperationEventContext: View {
    let events: [JSON]
    @Binding var selection: String
    var fixed = false
    var body: some View {
        Panel {
            if let event = events.first(where: { $0.id == selection }) {
                Text(event["title"].text).font(Theme.title(20))
                if !event["city"]["name"].text.isEmpty { Text(event["city"]["name"].text).foregroundStyle(Theme.muted) }
                if event["startsAt"].exists { Text(L.date(event["startsAt"].text, zone: event["city"]["timezone"].text.isEmpty ? "Asia/Jakarta" : event["city"]["timezone"].text)).font(Theme.body(13)) }
            } else { Notice(text: L.t(selection.isEmpty ? "ux.operations.chooseEvent" : "ux.operations.eventUnavailable"), error: !selection.isEmpty) }
            if !fixed { Choice(label: selection.isEmpty ? "loyalty.event" : "ux.operations.changeEvent", options: events, selection: $selection, allowEmpty: true) }
        }
    }
}

struct RewardValidationView: View {
    var initialEventID = ""
    @State private var eventID = ""
    @State private var code = ""
    @State private var preview: JSON = .null
    @State private var previewEventID = ""
    @State private var camera = false
    @StateObject private var mutation = Mutation()
    var body: some View {
        DataPage(title: "loyalty.validateReward", path: "/api/admin/loyalty/operations", pinEventID: eventID) { data, _ in
            if initialEventID.isEmpty { OperationEventContext(events: data["events"].rows, selection: $eventID) }
            else if !data["events"].rows.contains(where: { $0.id == eventID }) { Notice(text: L.t("ux.operations.eventUnavailable"), error: true) }
            Notice(text: L.t("ux.reward.eligibility"))
            Field(key: "loyalty.code", value: $code).textInputAutocapitalization(.characters).autocorrectionDisabled().onChange(of: code) { _, v in code = String(v.uppercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber) }.prefix(6)); preview = .null }
            Button(L.t("loyalty.lookup")) { Task { await lookup(code) } }.buttonStyle(PATSButtonStyle(loading: mutation.busy)).disabled(mutation.busy || code.count != 6 || !data["events"].rows.contains(where: { $0.id == eventID }))
            Button(L.t("loyalty.scanCode"), systemImage: "qrcode.viewfinder") { camera = true }.buttonStyle(PATSButtonStyle(variant: .secondary)).disabled(mutation.busy || !data["events"].rows.contains(where: { $0.id == eventID }))
            MutationState(mutation: mutation)
            if preview.exists {
                let title = data["events"].rows.first(where: { $0.id == previewEventID })?["title"].text ?? ""
                Panel {
                    Text(title).fontWeight(.semibold)
                    Text(preview["reward"]["name"].text).font(Theme.title(20)); MemberIdentity(member: preview["member"])
                    Text(preview["code"].text).font(Theme.title(26)).monospaced(); Badge(value: preview["status"].text)
                    ConfirmAction(label: "loyalty.fulfill", message: title + "\n" + preview["reward"]["name"].text + " · " + preview["member"]["fullName"].text, disabled: mutation.busy || eventID != previewEventID) {
                        await mutation.run {
                            _ = try await APIClient.shared.call("POST", "/api/admin/loyalty/codes/fulfill", .object(["eventId": .str(previewEventID), "code": preview["code"]]))
                            preview = .null; code = ""; mutation.message = L.t("loyalty.fulfilled")
                        }
                    }
                }
            }
        }.onAppear { if !initialEventID.isEmpty { eventID = initialEventID } }
        .onChange(of: eventID) { _, _ in preview = .null; previewEventID = "" }
        .sheet(isPresented: $camera) { ScannerSheet { value in code = value; Task { await lookup(value) } } }
    }
    private func lookup(_ value: String) async {
        let selectedEvent = eventID
        guard !selectedEvent.isEmpty else { return }
        await mutation.run {
            preview = .null
            let result = try await APIClient.shared.call("POST", "/api/admin/loyalty/codes/preview", .object(["eventId": .str(selectedEvent), "code": .str(value.uppercased())]))["redemption"]
            guard eventID == selectedEvent else { return }
            previewEventID = selectedEvent; preview = result
        }
    }
}

struct ClaimsReviewView: View {
    var initialEventID = ""
    @State private var section = "pending"
    @State private var eventID = ""
    @State private var form = ""
    @State private var search = ""
    @State private var recentOnly = false
    @StateObject private var context = Resource()
    var body: some View {
        DataPage(title: "phase5.claimReview", path: "/api/admin/loyalty/claims", poll: true, eventContext: context.data["event"].id == eventID ? context.data["event"] : .null) { data, _ in
            let scoped = data["claims"].rows.filter { eventID.isEmpty || $0["eventId"].text == eventID }
            if !eventID.isEmpty {
                ResourceState(resource: context) { await context.load("/api/admin/events/\(eventID)") }
            }
            if initialEventID.isEmpty { Choice(label: "loyalty.event", options: claimEvents(data["claims"].rows), selection: $eventID, allowEmpty: true) }
            Field(key: "ux.claim.searchMember", value: $search)
            Picker(L.t("ux.claim.form"), selection: $form) {
                Text(L.t("ux.claim.allForms")).tag("")
                Text(L.t("phase5.claimMember")).tag("MEMBER")
                Text(L.t("phase5.claimPr")).tag("PR")
            }.pickerStyle(.menu)
            Toggle(L.t("ux.claim.recent"), isOn: $recentOnly)
            Tabs(options: [("pending", "ktm.pending"), ("history", "ktm.history")], selection: $section, counts: ["pending": scoped.filter { $0["status"].text == "PENDING" }.count])
            let rows = scoped.filter { claim in
                (claim["status"].text == "PENDING") == (section == "pending") && (form.isEmpty || claim["formType"].text == form)
                && (search.isEmpty || (claim["member"]["fullName"].text + " " + claim["member"]["nim"].text).localizedCaseInsensitiveContains(search))
                && (!recentOnly || (Dates.parse(claim["createdAt"].text).map { $0 >= Date().addingTimeInterval(-7 * 24 * 3600) } ?? false))
            }.sorted { a, b in
                let aDate = Dates.parse((section == "pending" ? a["createdAt"] : a["reviewedAt"].exists ? a["reviewedAt"] : a["createdAt"]).text) ?? .distantPast
                let bDate = Dates.parse((section == "pending" ? b["createdAt"] : b["reviewedAt"].exists ? b["reviewedAt"] : b["createdAt"]).text) ?? .distantPast
                return section == "pending" ? aDate < bDate : aDate > bDate
            }
            if rows.isEmpty { EmptyState(title: "phase5.claimEmpty", icon: "doc.text") }
            ForEach(rows) { claim in
                Panel {
                    NavigationRow(title: claim["member"]["fullName"].text, subtitle: claim["event"]["title"].text + " · " + L.t(claim["formType"].text == "PR" ? "phase5.claimPr" : "phase5.claimMember"), icon: "doc.text.magnifyingglass") { ClaimReviewDetail(claimID: claim.id) }
                    Badge(value: claim["status"].text)
                    if claim["createdAt"].exists { Text(L.date(claim["createdAt"].text)).font(Theme.body(13)).foregroundStyle(Theme.muted) }
                }
            }
        }.onAppear { if !initialEventID.isEmpty { eventID = initialEventID } }
        .task(id: eventID) { if !eventID.isEmpty { await context.load("/api/admin/events/\(eventID)") } }
    }
    private func claimEvents(_ claims: [JSON]) -> [JSON] {
        var seen = Set<String>()
        return claims.compactMap { claim in
            let id = claim["eventId"].text
            guard seen.insert(id).inserted else { return nil }
            return .object(["id": .str(id), "title": claim["event"]["title"]])
        }
    }
}

struct ClaimReviewDetail: View {
    let claimID: String
    @StateObject private var context = Resource()
    var body: some View {
        DataPage(title: "ux.claim.review", path: "/api/admin/loyalty/claims", poll: true, eventContext: context.data["event"]) { data, reload in
            if let claim = data["claims"].rows.first(where: { $0.id == claimID }) {
                VStack(alignment: .leading, spacing: Theme.padding) {
                    ClaimReviewCard(claim: claim, rules: data["rules"], reload: reload).id(claim.id + claim["status"].text)
                }.task(id: claim["eventId"].text) { await context.load("/api/admin/events/\(claim["eventId"].text)") }
            } else { EmptyState(title: "phase5.claimEmpty") }
        }
    }
}

struct ClaimReviewCard: View {
    let claim: JSON
    var rules: JSON = .null
    let reload: () async -> Void
    @State private var guests = "0"
    @State private var reservations = "0"
    @State private var reason = ""
    @StateObject private var mutation = Mutation()
    private var glAllowed: Bool { claim["glAllowed"].exists ? claim["glAllowed"].bool : claim["formType"].text == "PR" || rules["allowMemberGl"].bool }
    private var glKnown: Bool { claim["glAllowed"].exists || claim["formType"].text == "PR" || rules["allowMemberGl"].exists }
    private func editable(_ field: String) -> Bool { !claim["editableFields"].exists || claim["editableFields"].rows.contains(.str(field)) }
    private var guestEditable: Bool { glAllowed && editable("guestCount") }
    private var reservationEditable: Bool { editable("reservationCount") }
    private var minimumReason: Int { rules["rejectReasonMin"].exists ? max(3, min(1000, rules["rejectReasonMin"].int)) : 3 }
    private var valid: Bool { (!guestEditable || (Int(guests).map { (0...1_000_000).contains($0) } ?? false)) && (!reservationEditable || (Int(reservations).map { (0...1_000_000).contains($0) } ?? false)) }
    var body: some View {
        Panel {
            ClaimSummary(claim: claim)
            if !claim["receiptUrl"].text.isEmpty { PrivateReceiptButton(path: "/api/loyalty/claims/\(claim.id)/receipt?format=json") }
            if claim["status"].text == "PENDING" {
                Text(L.t("phase5.claimAdjustHint")).font(Theme.body(13)).foregroundStyle(Theme.muted)
                if guestEditable { Field(key: "phase5.guestCount", value: $guests, keyboard: .numberPad) }
                else if glAllowed { Text(L.t("ux.claim.countReadOnly")) .font(Theme.body(13)).foregroundStyle(Theme.muted) }
                else { Notice(text: L.t(glKnown ? "ux.claim.glDisallowed" : "ux.claim.glUnavailable")) }
                if reservationEditable { Field(key: "phase5.reservationCount", value: $reservations, keyboard: .numberPad) }
                if !valid { Notice(text: L.t("ux.claim.countValidation"), error: true) }
                Notice(text: L.t("ux.claim.awardServer"))
                Field(key: "ux.claim.rejectReason", value: $reason)
                Text(L.t("ux.claim.rejectRequired")).font(Theme.body(13)).foregroundStyle(Theme.muted)
                if reason.trimmingCharacters(in: .whitespacesAndNewlines).count > 1000 { Notice(text: L.t("ux.claim.reasonTooLong"), error: true) }
                ConfirmAction(label: "phase5.approve", message: approvalSummary, disabled: mutation.busy || !valid || reason.trimmingCharacters(in: .whitespacesAndNewlines).count > 1000 || (!glKnown && claim["guestCount"].int > 0)) { await decide("APPROVED") }
                ConfirmAction(label: "phase5.reject", message: reason, destructive: true, disabled: mutation.busy || !(minimumReason...1000).contains(reason.trimmingCharacters(in: .whitespacesAndNewlines).count)) { await decide("REJECTED") }
            }
            MutationState(mutation: mutation)
        }.onAppear { guests = claim["guestCount"].text; reservations = claim["reservationCount"].text }
    }
    private var approvalSummary: String {
        claim["event"]["title"].text + "\n" + claim["member"]["fullName"].text + "\n" + L.t("phase5.guestCount") + ": " + (glAllowed ? guestEditable ? guests : claim["guestCount"].text : "0") + " · " + L.t("phase5.reservationCount") + ": " + (reservationEditable ? reservations : claim["reservationCount"].text) + "\n" + L.t("ux.claim.awardServer")
    }
    private func decide(_ decision: String) async {
        var body: [String: JSON] = ["id": .str(claim.id), "decision": .str(decision), "reason": .str(reason)]
        if decision == "APPROVED" {
            if guestEditable { body["guestCount"] = .num(Int(guests) ?? 0) }
            if reservationEditable { body["reservationCount"] = .num(Int(reservations) ?? 0) }
        }
        await mutation.send("/api/admin/loyalty/claims", body: .object(body), after: reload)
    }
}

struct CrewOperationsView: View {
    var initialEventID = ""
    @State private var eventID = ""
    var body: some View {
        DataPage(title: "loyalty.operations", path: "/api/admin/loyalty/operations") { data, _ in
            Panel {
                ForEach(["members", "checkIns", "fulfilled", "revenue"], id: \.self) { key in
                    Text(L.t("loyalty.\(key == "fulfilled" ? "fulfilledCount" : key)") + ": " + (key == "revenue" ? L.money(data["stats"][key].int) : L.count(data["stats"][key].int)))
                }
                NavigationRow(title: "phase5.claimReview", icon: "doc.text") { ClaimsReviewView(initialEventID: initialEventID) }
            }
            OperationEventContext(events: data["events"].rows, selection: $eventID, fixed: !initialEventID.isEmpty)
            if data["events"].rows.contains(where: { $0.id == eventID }) { NavigationRow(title: "loyalty.recap", icon: "chart.bar") { EventRecapView(eventID: eventID) } }
            Panel {
                NavigationRow(title: "ux.operations.memberManagement", icon: "person.badge.key") { PromoterManagementView() }
                NavigationRow(title: "ux.operations.archive", subtitle: L.t("ux.operations.archiveBody"), icon: "archivebox") { LegacyPromoterArchiveView() }
            }
        }.onAppear { if !initialEventID.isEmpty { eventID = initialEventID } }
    }
}

struct PromoterManagementView: View {
    @EnvironmentObject private var store: AppStore
    @State private var search = ""
    @StateObject private var mutation = Mutation()
    var body: some View {
        DataPage(title: "ux.operations.memberManagement", path: "/api/admin/loyalty/operations") { data, reload in
            Field(key: "native.search", value: $search)
            MutationState(mutation: mutation)
            ForEach(data["members"].rows.filter { search.isEmpty || ($0["fullName"].text + " " + $0["nim"].text).localizedCaseInsensitiveContains(search) }.prefix(30)) { member in
                Panel {
                    Text(member["fullName"].text + " · " + member["nim"].text)
                    if store.managing && store.can("promoter.manage") {
                        ConfirmAction(label: member["isPromoter"].bool ? "loyalty.removePromoter" : "loyalty.grantPromoter", message: member["fullName"].text, disabled: mutation.busy) {
                            await mutation.send("/api/admin/loyalty/promoters/\(member.id)", body: .object(["enabled": .bool(!member["isPromoter"].bool)]), after: reload)
                        }
                    }
                }
            }
        }
    }
}

struct LegacyPromoterArchiveView: View {
    var body: some View {
        DataPage(title: "ux.operations.archive", path: "/api/admin/loyalty/operations") { data, _ in
            Notice(text: L.t("ux.operations.archiveBody"))
            if data["reports"].rows.isEmpty { EmptyState(title: "ux.operations.archiveEmpty") }
            ForEach(data["reports"].rows) { report in
                Panel {
                    Text(report["member"]["fullName"].text).font(Theme.title(17)); Text(report["event"]["title"].text)
                    Badge(value: report["status"].text)
                    Text(L.count(report["guestCount"].int) + " · " + L.t("loyalty.guestCount"))
                    if report["receiptAmount"].exists { Text(L.money(report["receiptAmount"].int)) }
                    if !report["receiptUrl"].text.isEmpty { PrivateReceiptButton(path: "/api/loyalty/receipts/\(report.id)?format=json") }
                    if report["bonusKind"].exists { Text(report["bonusKind"].text == "CASH" ? L.money(report["bonusValue"].int) : L.count(report["bonusValue"].int) + " XP") }
                    if !report["rejectReason"].text.isEmpty { Text(report["rejectReason"].text) }
                    ForEach(report["payouts"].rows) { payout in Text(L.money(payout["amount"].int) + " · " + L.status(payout["status"].text)) }
                }
            }
        }
    }
}

struct EventRecapView: View {
    let eventID: String
    var body: some View {
        DataPage(title: "loyalty.recap", path: "/api/admin/loyalty/operations", pinEventID: eventID) { data, reload in
            if let event = data["events"].rows.first(where: { $0.id == eventID }) {
                RecapEditor(eventID: eventID, recap: event["recap"], reservationsSold: event["reservationsSold"], fdcSold: event["fdcSold"], canLock: data["canLockRecap"].bool, reload: reload).id(eventID + event["recap"]["updatedAt"].text + event["recap"]["lockedAt"].text)
            } else { EmptyState(title: "ux.operations.eventUnavailable") }
        }
    }
}

struct RecapEditor: View {
    let eventID: String
    let recap: JSON
    var reservationsSold: JSON = .null
    var fdcSold: JSON = .null
    var canLock = false
    let reload: () async -> Void
    @State private var values: [String: String] = [:]
    @StateObject private var mutation = Mutation()
    private let counts = ["sofaCount", "tableCount", "fdcCount", "paxCount", "revenueSofa", "revenueTable", "revenueFdc"]
    var body: some View {
        Panel {
            Text(L.t(recap["lockedAt"].exists ? "ux.recap.locked" : recap.exists ? "ux.recap.saved" : "ux.recap.unsaved")).fontWeight(.semibold)
            if recap["lockedAt"].exists { Text(L.date(recap["lockedAt"].text)).font(Theme.body(13)) }
            Text(L.t("ux.recap.sold")).font(Theme.title(20))
            LabeledContent(L.t("ux.recap.soldTable"), value: reservationsSold["table"].exists ? L.count(reservationsSold["table"].int) : "—")
            LabeledContent(L.t("ux.recap.soldSofa"), value: reservationsSold["sofa"].exists ? L.count(reservationsSold["sofa"].int) : "—")
            Text(L.t("ux.recap.soldHint")).font(Theme.body(13)).foregroundStyle(Theme.muted)
            LabeledContent(L.t("ux.recap.fdcSold"), value: fdcSold["status"].text == "definitionPending" || !fdcSold["value"].exists ? "—" : L.count(fdcSold["value"].int))
            if fdcSold["status"].text == "definitionPending" || !fdcSold["value"].exists { Text(L.t("ux.recap.fdcPending")).font(Theme.body(13)).foregroundStyle(Theme.muted) }
            Text(L.t("ux.recap.manualCounts")).font(Theme.title(20))
            Text(L.t("ux.recap.manualCountsHint")).font(Theme.body(13)).foregroundStyle(Theme.muted)
            ForEach(["tableCount", "sofaCount", "fdcCount"], id: \.self) { key in Field(key: "loyalty.\(key)", value: binding(key), keyboard: .numberPad).disabled(recap["lockedAt"].exists) }
            Text(L.t("ux.recap.attendance")).font(Theme.title(20))
            Field(key: "loyalty.paxCount", value: binding("paxCount"), keyboard: .numberPad).disabled(recap["lockedAt"].exists)
            Text(L.t("ux.recap.revenue")).font(Theme.title(20))
            ForEach(["revenueSofa", "revenueTable", "revenueFdc"], id: \.self) { key in Field(key: "loyalty.\(key)", value: binding(key), keyboard: .numberPad, money: true).disabled(recap["lockedAt"].exists) }
            Text(L.t("loyalty.total") + ": " + L.money(revenueTotal)).font(Theme.title(20))
            Text(L.t("ux.recap.responsibility")).font(Theme.title(20))
            Field(key: "phase5.personInCharge", value: binding("personInCharge")).disabled(recap["lockedAt"].exists)
            Field(key: "phase5.accountablePerson", value: binding("accountablePerson")).disabled(recap["lockedAt"].exists)
            Field(key: "loyalty.note", value: binding("note")).disabled(recap["lockedAt"].exists)
            MutationState(mutation: mutation)
            if !recap["lockedAt"].exists {
                Text(L.t("ux.recap.saveHint")).font(Theme.body(13)).foregroundStyle(Theme.muted)
                if !valid { Notice(text: L.t("ux.recap.validation"), error: true) }
                Button(L.t("common.save")) {
                    Task {
                        var body: [String: JSON] = ["eventId": .str(eventID)]
                        for key in counts { body[key] = .num(Int(binding(key).wrappedValue) ?? 0) }
                        for key in ["personInCharge", "accountablePerson", "note"] { body[key] = .str(binding(key).wrappedValue) }
                        await mutation.send("/api/admin/loyalty/recaps", body: .object(body), after: reload)
                    }
                }.buttonStyle(PATSButtonStyle(loading: mutation.busy)).disabled(mutation.busy || !valid)
                if canLock && recap.exists {
                    ConfirmAction(label: "ux.recap.lock", message: L.t("ux.recap.lockConfirm"), destructive: true, disabled: mutation.busy || !values.isEmpty) {
                        await mutation.send("/api/admin/loyalty/recaps", body: .object(["eventId": .str(eventID)]), method: "PATCH", after: reload)
                    }
                }
            }
        }
    }
    private func binding(_ key: String) -> Binding<String> {
        Binding(get: { values[key] ?? (recap[key].exists ? recap[key].text : counts.contains(key) ? "0" : "") }, set: { values[key] = $0 })
    }
    private var revenueTotal: Int { ["revenueSofa", "revenueTable", "revenueFdc"].reduce(0) { $0 + min(2_000_000_000, max(0, Int(binding($1).wrappedValue) ?? 0)) } }
    private var valid: Bool {
        counts.allSatisfy { key in Int(binding(key).wrappedValue).map { (0...(key.hasPrefix("revenue") ? 2_000_000_000 : 1_000_000)).contains($0) } ?? false }
        && ["personInCharge", "accountablePerson"].allSatisfy { !binding($0).wrappedValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        && binding("note").wrappedValue.count <= 2000
    }
}
