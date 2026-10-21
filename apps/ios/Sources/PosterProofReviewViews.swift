import SwiftUI

/// Regional staff receive their city queue; HQ receives all authorized cities from the server.
struct PosterProofReviewView: View {
    var eventID = ""
    var proofID = ""
    @EnvironmentObject private var store: AppStore
    @Environment(\.locale) private var locale
    @State private var status: String
    @State private var targetResolved = false
    @State private var targetMissing = false
    @State private var targetProof: JSON = .null
    @State private var showTarget = false
    @State private var refreshQueue: (() async -> Void)?
    @StateObject private var context = Resource()

    init(eventID: String = "", proofID: String = "") {
        self.eventID = eventID
        self.proofID = proofID
        // A notification may point to an already decided proof. Resolve its actual status first.
        _status = State(initialValue: proofID.isEmpty ? "PENDING" : "")
    }

    var body: some View {
        let localeIdentifier = locale.identifier
        let selectedStatus = status
        let relatedMissing = targetMissing
        let selectedProof = targetProof
        AdminModeRequired(capability: "promoter.manage") {
            DataPage(title: "ux.posterProof.queueTitle", path: query("/api/admin/poster-proofs", ["status": selectedStatus, "eventId": eventID]), poll: true, eventContext: context.data["event"]) { data, reload in
                Tabs(options: [("PENDING", "social.PENDING"), ("APPROVED", "social.APPROVED"), ("REJECTED", "social.REJECTED")], selection: $status)
                if !eventID.isEmpty { ResourceState(resource: context) { await loadContext() } }
                if relatedMissing { Notice(text: L.t("ux.posterReview.relatedUnavailable")) }
                let rows = data["proofs"].rows.filter { selectedStatus.isEmpty || $0["status"].text == selectedStatus }
                Text(L.t("ux.posterReview.loadedCount", ["count": L.count(rows.count)])).id(localeIdentifier).font(Theme.body(13)).foregroundStyle(Theme.muted)
                if rows.isEmpty {
                    EmptyState(title: selectedStatus == "PENDING" ? "ux.posterProof.queueEmpty" : "ux.posterReview.historyEmpty", message: "ux.posterProof.queueEmptyBody", icon: "photo.on.rectangle")
                }
                ForEach(rows) { proof in
                    Panel {
                        NavigationRow(title: proof["member"]["fullName"].text, subtitle: proof["event"]["title"].text + " · " + proof["event"]["city"].text, icon: "photo") {
                            PosterProofReviewDetail(initialProof: proof, reloadQueue: reload)
                        }
                        Badge(value: proof["status"].text)
                        Text(PosterProofReviewCopy.status(proof)).id(localeIdentifier).font(Theme.body(13)).foregroundStyle(Theme.muted)
                    }
                    .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(proof.id == proofID ? Theme.accent : .clear, lineWidth: 2))
                }
                Color.clear.frame(height: 0).task(id: data["proofs"].wire) {
                    refreshQueue = reload
                    guard !proofID.isEmpty, !targetResolved else { return }
                    targetResolved = true
                    if let proof = data["proofs"].rows.first(where: { $0.id == proofID }) {
                        targetProof = proof
                        status = proof["status"].text
                        showTarget = true
                    } else {
                        targetMissing = true
                        status = "PENDING"
                    }
                }
            }
            .task(id: eventID) { await loadContext() }
            .navigationDestination(isPresented: $showTarget) {
                if selectedProof.exists {
                    PosterProofReviewDetail(initialProof: selectedProof, reloadQueue: { if let refreshQueue { await refreshQueue() } })
                }
            }
        }
    }

    private func loadContext() async {
        guard store.managing, store.can("promoter.manage"), !eventID.isEmpty else { return }
        await context.load("/api/admin/events/\(eventID)")
    }
}

private struct PosterProofReviewDetail: View {
    let initialProof: JSON
    var reloadQueue: () async -> Void
    @EnvironmentObject private var store: AppStore
    @Environment(\.locale) private var locale
    @State private var proof: JSON
    @State private var reason = ""
    @StateObject private var context = Resource()
    @StateObject private var latest = Resource()
    @StateObject private var mutation = Mutation()

    init(initialProof: JSON, reloadQueue: @escaping () async -> Void) {
        self.initialProof = initialProof
        self.reloadQueue = reloadQueue
        _proof = State(initialValue: initialProof)
    }

    private var trimmedReason: String { reason.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var reasonValid: Bool { (3...500).contains(trimmedReason.utf16.count) }
    private var pending: Bool { proof["status"].text == "PENDING" }
    private var authorized: Bool { store.managing && store.can("promoter.manage") }
    private var timezone: String { context.data["event"]["city"]["timezone"].text }

    var body: some View {
        let localeIdentifier = locale.identifier
        let displayedProof = proof
        let isPending = pending
        let rejectionText = reason
        let rejectionValid = reasonValid
        let trimmedRejection = trimmedReason
        let displayedTimezone = timezone
        AdminModeRequired(capability: "promoter.manage") {
            Page(title: "ux.posterReview.detail", eventContext: context.data["event"]) {
                ResourceState(resource: context) { await loadContext() }
                ResourceState(resource: latest) { await refreshProof() }
                Panel {
                    Text(displayedProof["member"]["fullName"].text).font(Theme.title(22))
                    Text(displayedProof["member"]["nim"].text).monospacedDigit()
                    Text(displayedProof["event"]["title"].text).font(Theme.title(17))
                    Text(displayedProof["event"]["city"].text).foregroundStyle(Theme.muted)
                    Badge(value: displayedProof["status"].text)
                    Text(PosterProofReviewCopy.status(displayedProof)).id(localeIdentifier).fontWeight(.semibold)
                    if !displayedTimezone.isEmpty {
                        DetailRow(key: "ux.posterReview.submittedAt", value: L.date(displayedProof["submittedAt"].text, zone: displayedTimezone))
                        if displayedProof["reviewedAt"].exists { DetailRow(key: "ux.posterReview.reviewedAt", value: L.date(displayedProof["reviewedAt"].text, zone: displayedTimezone)) }
                    }
                    if !displayedProof["reviewedBy"].text.isEmpty { DetailRow(key: "ux.posterReview.reviewedBy", value: displayedProof["reviewedBy"].text) }
                }
                PosterProofImage(proof: displayedProof)
                MutationState(mutation: mutation)
                if isPending {
                    Panel {
                        Text(L.t("ux.posterReview.reward", ["xp": L.count(displayedProof["rewardXp"].int)])).fontWeight(.semibold)
                        ConfirmAction(label: L.t("ux.posterProof.approve", ["xp": L.count(displayedProof["rewardXp"].int)]), message: L.t("ux.posterReview.approveConfirm", ["member": displayedProof["member"]["fullName"].text, "event": displayedProof["event"]["title"].text, "xp": L.count(displayedProof["rewardXp"].int)]), disabled: mutation.busy || store.operationInProgress) {
                            await decide("APPROVED")
                        }
                        Field(key: "ux.posterProof.reason", value: $reason)
                        Text(L.t("ux.posterReview.reasonHint")).font(Theme.body(13)).foregroundStyle(Theme.muted)
                        if !rejectionText.isEmpty && !rejectionValid { Notice(text: L.t("ux.posterReview.reasonInvalid"), error: true) }
                        ConfirmAction(label: "ux.posterProof.reject", message: L.t("ux.posterReview.rejectConfirm", ["member": displayedProof["member"]["fullName"].text, "event": displayedProof["event"]["title"].text, "reason": trimmedRejection]), destructive: true, disabled: mutation.busy || store.operationInProgress || !rejectionValid) {
                            await decide("REJECTED")
                        }
                    }
                }
            }
            .task(id: displayedProof["event"].id) { await loadContext() }
            .refreshable { await refreshProof(); await loadContext() }
            .navigationBarBackButtonHidden(mutation.busy)
            .interactiveDismissDisabled(mutation.busy)
        }
    }

    private func loadContext() async {
        guard authorized, !proof["event"].id.isEmpty else { return }
        await context.load("/api/admin/events/\(proof["event"].id)")
    }

    private func refreshProof() async {
        guard authorized else { return }
        await latest.load(query("/api/admin/poster-proofs", ["eventId": proof["event"].id]))
        if latest.error == nil, let current = latest.data["proofs"].rows.first(where: { $0.id == proof.id }) { proof = current }
    }

    private func decide(_ decision: String) async {
        guard authorized, pending, !mutation.busy, !store.operationInProgress, decision != "REJECTED" || reasonValid else { return }
        let note = decision == "REJECTED" ? trimmedReason : ""
        store.operationInProgress = true
        defer { store.operationInProgress = false }
        await mutation.run {
            do {
                let response = try await APIClient.shared.call("POST", "/api/admin/poster-proofs/\(proof.id)/decision", .object(["decision": .str(decision), "reason": .str(note)]))
                // The decision response has proof status/award fields; retain its member and event context.
                var updated = proof.object
                response["proof"].object.forEach { updated[$0.key] = $0.value }
                proof = .object(updated)
                await refreshProof()
                reason = ""
                mutation.message = L.t(decision == "APPROVED" ? "ux.posterProof.approved" : "ux.posterProof.rejected")
                await reloadQueue()
            } catch let error as APIError where error.code == "REQUEST_DECIDED" {
                await refreshProof()
                throw error
            }
        }
    }
}

private enum PosterProofReviewCopy {
    static func status(_ proof: JSON) -> String {
        switch proof["status"].text {
        case "APPROVED": return L.t("ux.posterProof.statusAPPROVED", ["xp": L.count(proof["xpAwarded"].int)])
        case "REJECTED": return L.t("ux.posterProof.statusREJECTED", ["reason": proof["rejectReason"].text])
        default: return L.t("ux.posterProof.statusPENDING")
        }
    }
}
