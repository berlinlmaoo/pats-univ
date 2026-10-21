import SwiftUI

struct HandoverView: View {
    @EnvironmentObject private var store: AppStore
    @State private var reader: any CardReader = CoreNFCCardReader()
    @State private var scan: CardScan?
    @State private var preview: JSON = .null
    @StateObject private var mutation = Mutation()
    var body: some View {
        Page(title: "app.handoverTitle") {
            Notice(text: L.t("app.handoverBody"))
            if reader.available {
                Button(L.t("app.handoverTap")) { Task { await mutation.run {
                    preview = .null; scan = nil
                    let value = try await reader.read(); scan = value
                    preview = try await APIClient.shared.call("POST", "/api/admin/cards/handover/preview", .object(["token": .str(value.token), "nfcUid": .str(value.uid)]))
                } } }.buttonStyle(PATSButtonStyle(loading: mutation.busy)).disabled(mutation.busy)
            } else {
                Notice(text: L.t("ux.card.handoverNfcRequired"))
                NavigationRow(title: "app.adminCards", subtitle: L.t("ux.card.identificationOnly"), icon: "person.text.rectangle") { MemberCardsView() }
            }
            MutationState(mutation: mutation)
            if preview.exists {
                Panel {
                    MemberIdentity(member: preview["member"]); Badge(value: preview["card"]["status"].text)
                    if preview["issue"].exists {
                        Notice(text: handoverIssue, error: true)
                    }
                    ConfirmAction(label: "app.handoverConfirm", message: L.t("app.handoverCheck") + "\n" + preview["member"]["fullName"].text + " · " + preview["member"]["nim"].text, disabled: mutation.busy || preview["issue"].exists || scan == nil) {
                        guard let scan else { return }
                        await mutation.run {
                            _ = try await APIClient.shared.call("POST", "/api/admin/cards/handover", .object(["token": .str(scan.token), "nfcUid": .str(scan.uid)]))
                            preview = .null; self.scan = nil; mutation.message = L.t("app.handoverDone")
                        }
                    }
                }
            }
        }.onChange(of: mutation.busy) { _, busy in store.operationInProgress = busy }
        .navigationBarBackButtonHidden(mutation.busy)
        .interactiveDismissDisabled(mutation.busy)
        .onDisappear { reader.cancel(); if !mutation.busy { store.operationInProgress = false } }
    }
    private var handoverIssue: String {
        switch preview["issue"]["code"].text {
        case "ALREADY_DELIVERED": return L.t("app.handoverAlready", ["date": L.date(preview["issue"]["at"].text), "name": preview["issue"]["by"].text])
        case "MEMBER_INACTIVE": return L.t("app.resultInactive")
        case "OTHER_CITY": return L.t("app.handoverOtherCity", ["city": preview["member"]["city"]["name"].text])
        default: return L.t("nfc.readFailed")
        }
    }
}
struct MemberCardsView: View {
    @State private var term = ""
    @StateObject private var state = Resource()
    var body: some View {
        Page(title: "app.adminCards") {
            Notice(text: L.t("ux.card.repairReplaceGuide"))
            Field(key: "native.search", value: $term)
            if term.count < 2 { Notice(text: L.t("app.cardsSearchHint")) }
            ResourceState(resource: state) { await search() }
            if state.data.exists && state.data["members"].rows.isEmpty { EmptyState(title: "app.manualEmptyTitle", message: "app.cardsSearchEmpty") }
            ForEach(state.data["members"].rows) { member in
                Panel { NavigationRow(title: member["fullName"].text, subtitle: member["nim"].text, icon: "person.text.rectangle") { MemberCardsDetail(memberID: member.id) }; Badge(value: member["card"]["status"].text) }
            }
        }.task(id: term) {
            do { try await Task.sleep(for: .milliseconds(350)) } catch { return }; await search()
        }
    }
    private func search() async { if term.count >= 2 { await state.load(query("/api/admin/cards/members", ["q": term])) } else { state.data = .null } }
}
struct MemberCardsDetail: View {
    let memberID: String
    @EnvironmentObject private var store: AppStore
    @StateObject private var mutation = Mutation()
    @State private var reason = ""
    @State private var action = ""
    var body: some View {
        let selectedAction = action
        let reasonLength = reason.trimmingCharacters(in: .whitespacesAndNewlines).count
        DataPage(title: "app.adminCards", path: "/api/admin/cards/members/\(memberID)", poll: true) { data, reload in
            Panel { MemberIdentity(member: data["member"]) }
            Panel {
                Text(L.t("ux.card.chipQuestion")).font(Theme.title(20))
                Notice(text: L.t("ux.card.repairReplaceGuide"))
                Button(L.t("ux.card.repair")) { action = "repair"; reason = "" }.buttonStyle(PATSButtonStyle(variant: .secondary))
                Button(L.t("ux.card.replace")) { action = "replace"; reason = "" }.buttonStyle(PATSButtonStyle(variant: .secondary))
            }
            if data["reencode"].exists {
                Panel {
                    Text(L.t("ux.reencode." + reencodeStatus(data["reencode"]))).font(Theme.title(20))
                    Text(L.t("ux.reencode.requester", ["name": data["reencode"]["requestedBy"].text]))
                    if data["reencode"]["createdAt"].exists { Text(L.t("ux.reencode.requestedAt", ["date": L.date(data["reencode"]["createdAt"].text)])) }
                    if !data["reencode"]["decidedBy"].text.isEmpty { Text(L.t("ux.reencode.decidedBy", ["name": data["reencode"]["decidedBy"].text])) }
                    if !data["reencode"]["decisionNote"].text.isEmpty { Text(data["reencode"]["decisionNote"].text) }
                    if data["reencode"]["grantExpiresAt"].exists { Text(L.t("ux.reencode.oneUseUntil", ["date": L.date(data["reencode"]["grantExpiresAt"].text)])) }
                    if data["reencode"]["usedAt"].exists { Text(L.t("ux.reencode.usedAt", ["date": L.date(data["reencode"]["usedAt"].text)])) }
                    Notice(text: L.t("ux.reencode.next." + reencodeStatus(data["reencode"])))
                    if reencodeStatus(data["reencode"]) == "APPROVED" && data["reencode"]["mine"].bool && validReencodeGrant(data["reencode"]) {
                        NavigationRow(title: "app.reencodeNow", icon: "wave.3.right") { EncodeView(grantID: data["reencode"].id, initialLookup: data["member"]["nim"].text, reencode: true) }
                    } else if reencodeStatus(data["reencode"]) == "APPROVED" { Notice(text: L.t(data["reencode"]["mine"].bool ? "ux.reencode.deadlineUnavailable" : "ux.reencode.requesterOnly")) }
                }
            }
            ForEach(data["cards"].rows) { card in
                Panel {
                    Badge(value: card["status"].text)
                    Text(card["nfcUid"].text).monospaced(); Text(card["chipType"].text)
                    Text(card["batch"]["label"].text).foregroundStyle(Theme.muted)
                    if card["deliveredAt"].exists { Text(L.date(card["deliveredAt"].text)) }
                    if card["isReplacement"].bool || card["replacementFee"].exists {
                        Notice(text: L.t("ux.card.replacementNext"))
                        if card["replacementFee"].exists {
                            let fee = card["replacementFee"]
                            LabeledContent(L.t("ux.card.feeAmount"), value: L.money(fee["amount"].int))
                            if fee["paidAt"].exists {
                                Label(L.t("ux.card.feePaid", ["date": L.date(fee["paidAt"].text)]), systemImage: "checkmark.circle.fill")
                            } else {
                                Notice(text: L.t("ux.card.feeOffApp"))
                                if store.managing && store.can("card.reportLost") {
                                    ConfirmAction(label: "ux.card.recordFee", message: L.t("ux.card.recordFeeConfirm", ["amount": L.money(fee["amount"].int), "member": data["member"]["fullName"].text, "nim": data["member"]["nim"].text]), disabled: mutation.busy) {
                                        guard store.managing, store.can("card.reportLost") else { return }
                                        store.operationInProgress = true
                                        defer { store.operationInProgress = false }
                                        await mutation.run {
                                            _ = try await APIClient.shared.call("POST", "/api/admin/payments", .object(["kind": .str("card"), "id": .str(card.id)]))
                                            await reload(); mutation.message = L.t("ux.card.feeRecorded")
                                        }
                                    }
                                }
                            }
                        } else if store.managing && store.can("dashboard.access") {
                            Link(L.t("ux.card.recordReplacementPayment"), destination: Config.baseURL.appendingPathComponent("regional").appending(queryItems: [URLQueryItem(name: "tab", value: "payments")]))
                            Text(L.t("ux.card.paymentRefresh")).font(Theme.body(13)).foregroundStyle(Theme.muted)
                        }
                        Button(L.t("ux.operations.refresh")) { Task { await reload() } }.buttonStyle(PATSButtonStyle(variant: .secondary)).disabled(mutation.busy)
                    }
                    if store.managing && card["status"].text != "REVOKED" && card["status"].text != "NOT_PRINTED" && !selectedAction.isEmpty {
                        if selectedAction == "replace" || !store.can("card.encode") {
                            Notice(text: L.t(selectedAction == "replace" ? "ux.card.replaceConsequences" : "ux.card.repairConsequences"), error: selectedAction == "replace")
                            Field(key: "phase5.reason", value: $reason)
                        }
                        if selectedAction == "replace" && store.can("card.reportLost") {
                            ConfirmAction(label: "ux.card.replace", message: data["member"]["fullName"].text + "\n" + L.t("ux.card.replaceConsequences"), destructive: true, disabled: mutation.busy || reasonLength < 3) {
                                await mutation.send("/api/admin/cards/\(card.id)/revoke", body: .object(["reason": .str(reason)]), after: reload)
                            }
                        }
                        if selectedAction == "repair" && store.can("card.encode") && card["status"].text == "DELIVERED" {
                            NavigationRow(title: "ux.encode.repairTitle", icon: "wave.3.right") { EncodeView(initialLookup: data["member"]["nim"].text, reencode: true) }
                        } else if selectedAction == "repair" && store.can("card.requestReencode") && card["status"].text == "DELIVERED" {
                            ConfirmAction(label: "app.cardsReencodeSend", message: data["member"]["fullName"].text + "\n" + L.t("ux.card.repairConsequences"), disabled: mutation.busy || reasonLength < 3 || ["PENDING", "APPROVED"].contains(reencodeStatus(data["reencode"]))) {
                                await mutation.send("/api/admin/cards/\(card.id)/reencode-requests", body: .object(["reason": .str(reason)]), after: reload)
                            }
                        } else if selectedAction == "repair" { Notice(text: L.t("ux.card.repairNotAvailable")) }
                    }
                }
            }
            MutationState(mutation: mutation)
        }
    }
    private func reencodeStatus(_ request: JSON) -> String {
        guard request.exists else { return "" }
        let status = request["status"].text
        if status == "APPROVED", let deadline = Dates.parse(request["grantExpiresAt"].text), deadline <= Date() { return "EXPIRED" }
        return ["PENDING", "APPROVED", "EXPIRED", "USED", "REJECTED"].contains(status) ? status : "PENDING"
    }
    private func validReencodeGrant(_ request: JSON) -> Bool { Dates.parse(request["grantExpiresAt"].text).map { $0 > Date() } ?? false }
}
struct EncodingBatchesView: View {
    var body: some View {
        DataPage(title: "app.adminEncode", path: "/api/hq/batches") { data, _ in
            Notice(text: L.t("app.encodeIntro"))
            NavigationRow(title: "app.encodeAnyCard", icon: "qrcode") { EncodeView() }
            NavigationRow(title: "app.encodeReencode", icon: "arrow.triangle.2.circlepath") { EncodeView(reencode: true) }
            if data["batches"].rows.isEmpty { EmptyState(title: "app.encodeNoBatchTitle", message: "app.encodeNoBatchBody") }
            ForEach(data["batches"].rows) { b in
                Panel {
                    NavigationRow(title: b["label"].text, subtitle: b["city"]["name"].text, icon: "rectangle.stack") { EncodeView(batchID: b.id, batchLabel: b["label"].text) }
                    Badge(value: b["status"].text)
                    ProgressView(value: Double(b["encodedCount"].int), total: Double(max(1, b["cardCount"].int)))
                    Text(L.t("app.encodeProgress", ["label": b["label"].text, "done": L.count(b["encodedCount"].int), "total": L.count(b["cardCount"].int)]))
                }
            }
        }
    }
}

struct PendingEncode: Codable {
    let cardID: String
    let leaseID: String
    let userID: String
    let origin: String
    let result: EncodeResult
    var batchID: String? = nil
    var batchLabel: String? = nil
    var reencode: Bool? = nil
    var memberName: String? = nil
    var memberNIM: String? = nil
    var body: JSON { .object(["leaseId": .str(leaseID), "nfcUid": .str(result.nfcUid), "chipType": .str(result.chipType), "protectedNow": .bool(result.protectedNow)]) }
}
@MainActor final class EncodeStation: ObservableObject {
    @Published var claim: JSON = .null
    @Published var pending: PendingEncode?
    @Published var done = false
    let mutation = Mutation()
    let reader: any CardReader
    private let userID: String
    private var preparedBatchID = ""
    private var preparedBatchLabel = ""
    @Published private(set) var preparedReencode: Bool?
    private var account: String { "encode-report.\(userID)" }
    init(userID: String, reader: (any CardReader)? = nil) {
        self.userID = userID; self.reader = reader ?? CoreNFCCardReader()
        if let d = Keychain.load("encode-report.\(userID)"), let report = try? JSONDecoder().decode(PendingEncode.self, from: d), report.userID == userID && report.origin == Config.baseURL.absoluteString { pending = report; preparedReencode = report.reencode }
    }
    private var station: String {
        let key = "encode-station"
        var id = Keychain.load(key).flatMap { String(data: $0, encoding: .utf8) }
        if id == nil { id = UUID().uuidString; try? Keychain.save(Data(id!.utf8), key) }
        return "iPhone · " + String(id!.prefix(12))
    }
    func prepare(lookup: String, batchID: String, batchLabel: String = "", grantID: String, reencode: Bool) async {
        guard pending == nil else { return }
        await mutation.run {
            await release(); done = false
            var body: [String: JSON] = ["lookup": .str(lookup.trimmingCharacters(in: .whitespacesAndNewlines)), "station": .str(station), "mode": .str(reencode ? "reencode" : "encode")]
            if !batchID.isEmpty { body["batchId"] = .str(batchID) }
            if !grantID.isEmpty { body["grantId"] = .str(grantID) }
            claim = try await APIClient.shared.call("POST", "/api/hq/cards/prepare", .object(body))
            preparedBatchID = batchID; preparedBatchLabel = batchLabel
            switch claim["lease"]["mode"].text {
            case "encode": preparedReencode = false
            case "reencode": preparedReencode = true
            default: preparedReencode = reencode
            }
        }
    }
    func write() async {
        guard claim["lease"].exists, pending == nil, !done else { return }
        await mutation.run {
            do {
                let result = try await reader.encode { inspection in
                    let key = try await APIClient.shared.call("POST", "/api/hq/cards/\(self.claim["card"].id)/key", .object(["leaseId": self.claim["lease"]["id"], "nfcUid": .str(inspection.uid)]))
                    return TagCredentials(url: key["url"].text, pwd: try Hex.bytes(key["pwd"].text), pack: try Hex.bytes(key["pack"].text))
                }
                let report = PendingEncode(cardID: claim["card"].id, leaseID: claim["lease"].id, userID: userID, origin: Config.baseURL.absoluteString, result: result, batchID: preparedBatchID, batchLabel: preparedBatchLabel, reencode: preparedReencode, memberName: claim["member"]["fullName"].text, memberNIM: claim["member"]["nim"].text)
                pending = report
                try Keychain.save(try JSONEncoder().encode(report), account)
                try await reportPending()
            } catch {
                if pending == nil { await release(failure: "NFC session did not finish") }
                if error is TagFailure { mutation.message = L.t("app.encodeNothingChanged") }
                throw error
            }
        }
    }
    func reportPending() async throws {
        guard let pending, pending.userID == userID, pending.origin == Config.baseURL.absoluteString else { return }
        _ = try await APIClient.shared.call("POST", "/api/hq/cards/\(pending.cardID)/encoded", pending.body)
        try Keychain.save(nil, account); self.pending = nil; done = true; claim = .null
        mutation.message = L.t("app.encodeDone")
    }
    func retryReport() async { await mutation.run { try await reportPending() } }
    func release(failure: String? = nil) async {
        guard pending == nil, claim["lease"].exists else { return }
        var body: [String: JSON] = ["leaseId": claim["lease"]["id"]]
        if let failure { body["failure"] = .str(failure) }
        _ = try? await APIClient.shared.call("POST", "/api/hq/cards/\(claim["card"].id)/release", .object(body))
        claim = .null
    }
    func cancel() { reader.cancel() }
}
struct EncodeView: View {
    var batchID = ""
    var batchLabel = ""
    var grantID = ""
    var initialLookup = ""
    var reencode = false
    @EnvironmentObject private var store: AppStore
    var body: some View { EncodeScreen(batchID: batchID, batchLabel: batchLabel, grantID: grantID, initialLookup: initialLookup, reencode: reencode, userID: store.user.id) }
}
struct EncodeScreen: View {
    let batchID: String, batchLabel: String, grantID: String, initialLookup: String
    let reencode: Bool
    @StateObject private var station: EncodeStation
    @State private var lookup = ""
    @State private var camera = false
    init(batchID: String, batchLabel: String, grantID: String, initialLookup: String, reencode: Bool, userID: String) {
        self.batchID = batchID; self.batchLabel = batchLabel; self.grantID = grantID; self.initialLookup = initialLookup; self.reencode = reencode
        _station = StateObject(wrappedValue: EncodeStation(userID: userID))
    }
    var body: some View {
        Page(title: screenTitle) {
            EncodeStationContent(station: station, mutation: station.mutation, lookup: $lookup, camera: $camera, batchID: batchID, batchLabel: batchLabel, grantID: grantID, reencode: reencode)
        }
        .task { if !initialLookup.isEmpty && station.pending == nil { lookup = initialLookup; await prepare() } }
        .sheet(isPresented: $camera) { ScannerSheet { value in lookup = value; Task { await prepare() } } }
        .onDisappear { station.cancel(); Task { await station.release() } }
    }
    private var screenTitle: String {
        if let pending = station.pending {
            guard let repair = pending.reencode else { return "ux.encode.resumeTitle" }
            return repair ? "ux.encode.repairTitle" : (pending.batchID ?? "").isEmpty ? "ux.encode.anyTitle" : "ux.encode.batchTitle"
        }
        return (station.preparedReencode ?? reencode) ? "ux.encode.repairTitle" : batchID.isEmpty ? "ux.encode.anyTitle" : "ux.encode.batchTitle"
    }
    private func prepare() async { await station.prepare(lookup: lookup, batchID: batchID, batchLabel: batchLabel, grantID: grantID, reencode: reencode) }
}
private struct EncodeStationContent: View {
    @EnvironmentObject private var store: AppStore
    @ObservedObject var station: EncodeStation
    @ObservedObject var mutation: Mutation
    @Binding var lookup: String
    @Binding var camera: Bool
    let batchID: String, batchLabel: String, grantID: String
    let reencode: Bool
    var body: some View {
        Panel {
            Text(L.t(operationTitle)).font(Theme.title(20))
            if !visibleBatch.isEmpty { Text(L.t("ux.encode.batch", ["batch": visibleBatch])) }
            if let pending = station.pending, let name = pending.memberName { Text(name + " · " + (pending.memberNIM ?? "")) }
            Text(L.t("ux.encode.stages")).font(Theme.body(13)).foregroundStyle(Theme.muted)
            Text(L.t(stageKey)).fontWeight(.semibold).accessibilityAddTraits(.updatesFrequently)
            if !station.reader.available { Notice(text: L.t("ux.card.encodeNfcRequired")) }
        }
        .onChange(of: mutation.busy) { _, busy in store.operationInProgress = busy }
        .navigationBarBackButtonHidden(mutation.busy)
        .interactiveDismissDisabled(mutation.busy)
        .onDisappear { if !mutation.busy { store.operationInProgress = false } }
        MutationState(mutation: mutation)
        if station.pending != nil {
            Notice(text: L.t("ux.encode.reportOnly"))
            Button(L.t("app.encodeReportAgain")) { Task { await station.retryReport() } }.buttonStyle(PATSButtonStyle(loading: mutation.busy)).disabled(station.mutation.busy)
        } else if station.claim.exists {
            Panel {
                MemberIdentity(member: station.claim["member"])
                Badge(value: station.claim["card"]["status"].text)
                if station.claim["alreadyEncoded"].bool { Notice(text: L.t("app.encodeAlready", ["station": station.claim["card"]["encodedStation"].text])) }
                else {
                    ConfirmAction(label: "app.encodeTap", message: L.t("native.confirmName") + "\n" + station.claim["member"]["fullName"].text + " · " + station.claim["member"]["nim"].text, disabled: station.mutation.busy || !station.reader.available) { await station.write() }
                }
                Button(L.t("native.cancelLease")) { Task { await station.release() } }.disabled(station.mutation.busy)
            }
        } else {
            Notice(text: L.t(station.done ? "app.encodeDone" : "app.encodeIdentify"))
            Field(key: "app.encodeNim", value: $lookup)
            Button(L.t("app.encodeScanQr")) { camera = true }.buttonStyle(PATSButtonStyle(variant: .secondary)).disabled(station.mutation.busy)
            Button(L.t("app.encodeFind")) { Task { await station.prepare(lookup: lookup, batchID: batchID, batchLabel: batchLabel, grantID: grantID, reencode: reencode) } }.buttonStyle(PATSButtonStyle(loading: mutation.busy)).disabled(station.mutation.busy || lookup.trimmingCharacters(in: .whitespacesAndNewlines).count < 3)
        }
    }
    private var stageKey: String {
        if station.pending != nil { return "ux.encode.stageReport" }
        if station.done { return "ux.encode.stageComplete" }
        if station.claim.exists { return mutation.busy ? "ux.encode.stageWrite" : "ux.encode.stageVerify" }
        return "ux.encode.stageIdentify"
    }
    private var visibleBatch: String {
        if let pending = station.pending { return pending.batchLabel.flatMap { $0.isEmpty ? nil : $0 } ?? pending.batchID ?? "" }
        return batchLabel.isEmpty ? batchID : batchLabel
    }
    private var operationTitle: String {
        if let pending = station.pending {
            guard let repair = pending.reencode else { return "ux.encode.resumeTitle" }
            return repair ? "ux.encode.repairTitle" : (pending.batchID ?? "").isEmpty ? "ux.encode.anyTitle" : "ux.encode.batchTitle"
        }
        return (station.preparedReencode ?? reencode) ? "ux.encode.repairTitle" : batchID.isEmpty ? "ux.encode.anyTitle" : "ux.encode.batchTitle"
    }
}
