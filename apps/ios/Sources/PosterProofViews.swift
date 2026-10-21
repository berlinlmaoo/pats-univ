import SwiftUI
import PhotosUI

/// Proof is optional and independent of the required event journey. Server responses own its state and XP.
struct PosterProofStep: View {
    @Environment(\.locale) private var locale
    let event: JSON
    let step: JSON
    var focusProof = false
    let updated: @MainActor (JSON) async -> Void
    @StateObject private var mutation = Mutation()
    @State private var share: PosterShareItem?
    private var proof: JSON { step["proof"] }
    private var posterURL: String { EventJourneyPolicy.posterURL(event) }
    private var timezone: String { !event["timing"]["timezone"].text.isEmpty ? event["timing"]["timezone"].text : event["city"]["timezone"].text.isEmpty ? "Asia/Jakarta" : event["city"]["timezone"].text }
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.gap) {
            HStack {
                Text(L.t("ux.journey.poster")).font(Theme.title(20)).id(locale.identifier)
                Spacer()
                Text(L.t("ux.journey.optional")).font(Theme.body(13)).foregroundStyle(Theme.muted)
            }
            if focusProof && proof.exists { existingProof }
            Text(L.t("ux.journey.posterBody", ["xp": L.count(step["rewardXp"].int)])).font(Theme.body(14))
            if !posterURL.isEmpty {
                EventPosterHighlight(event: event)
                Button {
                    Task { await mutation.run {
                        let bytes = try await APIClient.shared.eventPosterImage(path: posterURL)
                        guard let image = UIImage(data: bytes) else { throw PosterProofFileError(key: "validation.flyerType") }
                        share = PosterShareItem(image: image)
                    } }
                } label: { Label(L.t("ux.journey.sharePoster"), systemImage: "square.and.arrow.up") }
                    .buttonStyle(PATSButtonStyle(variant: .secondary)).disabled(mutation.busy)
            } else { Notice(text: L.t("ux.posterProof.noPoster")) }
            if proof.exists {
                if !focusProof { existingProof }
            } else if step["outcome"].text == "skipped" {
                Label(L.t("ux.posterProof.skipped"), systemImage: "arrow.right.circle").font(Theme.body(14)).foregroundStyle(Theme.muted)
            }
            if EventJourneyPolicy.canUploadPosterProof(event: event, step: step) {
                Text(L.t("ux.posterProof.hint")).font(Theme.body(13)).foregroundStyle(Theme.muted)
                UncroppedProofPicker(label: proof.exists ? "ux.posterProof.replace" : "ux.posterProof.upload", busy: mutation.busy) { file in
                    await mutation.run {
                        let result = try await APIClient.shared.uploadPosterProof(eventID: event.id, image: file.data, contentType: file.contentType)
                        await updated(result)
                        mutation.message = L.t("ux.posterProof.submitted")
                    }
                }
            }
            if EventJourneyPolicy.canSkipPosterProof(step) {
                Button {
                    Task { await mutation.run {
                        let result = try await APIClient.shared.call("POST", "/api/me/journey", .object(["eventId": .str(event.id), "step": .str("poster")]))
                        await updated(result)
                    } }
                } label: { Text(L.t("ux.journey.posterSkip")) }
                    .buttonStyle(PATSButtonStyle(variant: .secondary)).disabled(mutation.busy)
            }
            MutationState(mutation: mutation)
        }.sheet(item: $share) { PosterShareSheet(image: $0.image) }
    }
    @ViewBuilder private var existingProof: some View {
        proofStatus
        PosterProofImage(proof: proof)
        if proof["submittedAt"].exists { Text(L.date(proof["submittedAt"].text, zone: timezone)).font(Theme.body(13)).foregroundStyle(Theme.muted) }
    }
    @ViewBuilder private var proofStatus: some View {
        switch proof["status"].text {
        case "APPROVED":
            if let xp = EventJourneyPolicy.posterAwardedXP(step) {
                Notice(text: L.t("ux.posterProof.statusAPPROVED", ["xp": L.count(xp)]))
            } else { Badge(value: "APPROVED") }
        case "REJECTED": Notice(text: L.t("ux.posterProof.statusREJECTED", ["reason": proof["rejectReason"].text]), error: true)
        case "PENDING": Notice(text: L.t("ux.posterProof.statusPENDING"))
        default: Badge(value: proof["status"].text)
        }
    }
}

/// The screenshot route requires bearer authentication for the owner or authorized staff.
struct PosterProofImage: View {
    @Environment(\.locale) private var locale
    let proof: JSON
    @State private var image: UIImage?
    @State private var loading = false
    @State private var error: String?
    @State private var preview: PosterShareItem?
    @State private var requestID = UUID()
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.gap) {
            if let image {
                Button { preview = PosterShareItem(image: image) } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        Image(uiImage: image).resizable().scaledToFit().frame(maxWidth: .infinity, maxHeight: 300)
                        Label(L.t("ux.notifAction.viewProof"), systemImage: "arrow.up.left.and.arrow.down.right").font(Theme.body(13)).id(locale.identifier)
                    }
                }.buttonStyle(.plain)
            } else if loading { ProgressView().frame(maxWidth: .infinity).accessibilityLabel(L.t("common.loading")) }
            if let error {
                Notice(text: error, error: true)
                Button { Task { await load() } } label: { Text(L.t("common.retry")) }.buttonStyle(PATSButtonStyle(variant: .secondary))
            }
        }
        .task(id: proof["imageUrl"].text + "|" + proof["submittedAt"].text) { await load() }
        .onDisappear { requestID = UUID(); image = nil; loading = false }
        .sheet(item: $preview) { item in
            NavigationStack {
                Page(title: "ux.notifAction.viewProof") { Image(uiImage: item.image).resizable().scaledToFit().frame(maxWidth: .infinity) }
                    .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { preview = nil } label: { Text(L.t("common.close")) } } }
            }
        }
    }
    @MainActor private func load() async {
        let path = proof["imageUrl"].text
        let request = UUID(); requestID = request
        image = nil; error = nil
        guard !path.isEmpty else { loading = false; return }
        loading = true; defer { if requestID == request { loading = false } }
        do {
            let bytes = try await APIClient.shared.privateImage(path: path)
            try Task.checkCancellation()
            guard requestID == request else { return }
            guard let value = UIImage(data: bytes) else { throw PosterProofFileError(key: "validation.flyerType") }
            image = value
        } catch is CancellationError { }
        catch { if !Task.isCancelled && requestID == request { self.error = error.localizedDescription } }
    }
}

struct PosterProofUploadImage {
    let data: Data
    let contentType: String
    /// Existing JPEG/PNG/WebP files keep their bytes. Other library formats are normalized without cropping.
    static func prepare(_ data: Data) throws -> PosterProofUploadImage {
        guard !data.isEmpty else { throw PosterProofFileError(key: "validation.flyerRequired") }
        let prefix = [UInt8](data.prefix(12))
        let contentType: String?
        if prefix.starts(with: [0xff, 0xd8, 0xff]) { contentType = "image/jpeg" }
        else if prefix.starts(with: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) { contentType = "image/png" }
        else if prefix.count >= 12 && Array(prefix[0..<4]) == Array("RIFF".utf8) && Array(prefix[8..<12]) == Array("WEBP".utf8) { contentType = "image/webp" }
        else { contentType = nil }
        let result: PosterProofUploadImage
        if let contentType { result = .init(data: data, contentType: contentType) }
        else {
            guard let image = UIImage(data: data), let normalized = image.pngData() else { throw PosterProofFileError(key: "validation.flyerType") }
            result = .init(data: normalized, contentType: "image/png")
        }
        guard result.data.count <= 5 * 1024 * 1024 else { throw PosterProofFileError(key: "validation.flyerTooLarge") }
        return result
    }
}

/// PhotosPicker selects the full library image: no square editing, minimum dimensions or crop.
private struct UncroppedProofPicker: View {
    @Environment(\.locale) private var locale
    let label: String
    let busy: Bool
    let complete: @MainActor (PosterProofUploadImage) async -> Void
    @State private var selection: PhotosPickerItem?
    @State private var loading = false
    @State private var error: String?
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.gap) {
            PhotosPicker(selection: $selection, matching: .images, preferredItemEncoding: .current) {
                Label(L.t(label), systemImage: "photo.on.rectangle").id(locale.identifier)
            }.buttonStyle(PATSButtonStyle(variant: .maroon)).disabled(busy || loading)
            if loading { Text(L.t("loyalty.uploading")).font(Theme.body(13)) }
            if let error { Notice(text: error, error: true) }
        }.task(id: selection) {
            guard let selection else { return }
            loading = true; error = nil
            defer { loading = false; self.selection = nil }
            do {
                guard let data = try await selection.loadTransferable(type: Data.self) else { throw PosterProofFileError(key: "validation.flyerRequired") }
                try Task.checkCancellation()
                let file = try PosterProofUploadImage.prepare(data)
                await complete(file)
            } catch is CancellationError { }
            catch { if !Task.isCancelled { self.error = error.localizedDescription } }
        }
    }
}
private struct PosterProofFileError: LocalizedError {
    let key: String
    var errorDescription: String? { L.t(key) }
}
private struct PosterShareItem: Identifiable { let id = UUID(); let image: UIImage }
private struct PosterShareSheet: UIViewControllerRepresentable {
    let image: UIImage
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: [image], applicationActivities: nil) }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) { }
}
