import SwiftUI
import AVFoundation
import UniformTypeIdentifiers

struct ProfileEditor: View {
    let member: JSON
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var drink = ""
    @State private var genre = ""
    @State private var song = ""
    @State private var quote = ""
    @StateObject private var mutation = Mutation()
    @FocusState private var invalid: String?
    var body: some View {
        Page(title: "ktm.editProfile") {
            DetailRow(key: "join.fullName", value: member["fullName"].text)
            Field(key: "join.favoriteDrink", value: $drink, focus: $invalid, focusKey: "drink")
            Field(key: "app.genre", value: $genre, focus: $invalid, focusKey: "genre")
            Field(key: "app.song", value: $song, focus: $invalid, focusKey: "song")
            Field(key: "join.quotes", value: $quote, focus: $invalid, focusKey: "quote")
            KTMCard(member: preview, interactive: false)
            MutationState(mutation: mutation)
            Button(L.t("common.save")) { Task { await save() } }.buttonStyle(PATSButtonStyle(loading: mutation.busy)).disabled(mutation.busy)
        }.onSubmit { Task { await save() } }.onAppear { drink = member["favoriteDrink"].text; genre = member["favoriteGenre"].text; song = member["favoriteSong"].text; quote = member["quotes"].text }
    }
    private var preview: JSON { var m = member; m["favoriteDrink"] = .str(drink); m["favoriteGenre"] = .str(genre); return m }
    private func save() async {
        let fields = [("drink", drink, 40), ("genre", genre, 50), ("song", song, 100), ("quote", quote, 140)]
        if let first = fields.first(where: { ($0.0 != "quote" && $0.1.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) || $0.1.utf16.count > $0.2 }) {
            invalid = first.0; mutation.error = L.t("ktm.profileInvalid"); UIAccessibility.post(notification: .announcement, argument: mutation.error); return
        }
        await mutation.run {
            _ = try await APIClient.shared.call("PATCH", "/api/me", .object(["favoriteDrink": .str(drink.trimmingCharacters(in: .whitespacesAndNewlines)), "favoriteGenre": .str(genre.trimmingCharacters(in: .whitespacesAndNewlines)), "favoriteSong": .str(song.trimmingCharacters(in: .whitespacesAndNewlines)), "quotes": .str(quote.trimmingCharacters(in: .whitespacesAndNewlines))]))
            await store.reload(); dismiss()
        }
    }
}

struct PhotoEditor: View {
    @EnvironmentObject private var store: AppStore
    @State private var source: PhotoSource?
    @StateObject private var mutation = Mutation()
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.gap) {
            HStack {
                MemberPhoto(url: store.member["photoUrl"].text)
                Text(L.t(store.member["photoUrl"].text.isEmpty ? "ktm.addPhoto" : "ktm.changePhoto")).font(Theme.title(17))
            }
            if store.member["photoUrl"].text.isEmpty { EmptyState(title: "ktm.addPhoto", message: "ktm.photoPrompt", icon: "person.crop.square") }
            HStack {
                Button(L.t("ktm.library"), systemImage: "photo.on.rectangle") { source = .library }
                if UIImagePickerController.isSourceTypeAvailable(.camera) {
                    Button(L.t("native.photo"), systemImage: "camera") {
                        Task {
                            if await AVCaptureDevice.requestAccess(for: .video) { source = .camera }
                            else { mutation.error = L.t("native.permission") }
                        }
                    }
                }
            }.buttonStyle(PATSButtonStyle(variant: .secondary)).disabled(mutation.busy)
            Text(L.t("ktm.photoHint")).font(Theme.body(13)).foregroundStyle(Theme.muted)
            MutationState(mutation: mutation)
        }.sheet(item: $source) { source in
            SquarePhotoPicker(source: source) { result in
                self.source = nil
                Task { await mutation.run {
                    let data = try result.get()
                    _ = try await APIClient.shared.replacePhoto(data)
                    await store.reload()
                } }
            }.ignoresSafeArea()
        }
    }
}
enum PhotoSource: String, Identifiable { case library, camera; var id: String { rawValue } }
struct SquarePhotoPicker: UIViewControllerRepresentable {
    let source: PhotoSource
    let complete: (Result<Data, Error>) -> Void
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController(); picker.sourceType = source == .camera ? .camera : .photoLibrary
        picker.mediaTypes = [UTType.image.identifier]; picker.allowsEditing = true; picker.delegate = context.coordinator
        return picker
    }
    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: SquarePhotoPicker
        init(_ parent: SquarePhotoPicker) { self.parent = parent }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.complete(.failure(CancellationError())) }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            guard let original = info[.originalImage] as? UIImage, let image = (info[.editedImage] ?? info[.originalImage]) as? UIImage,
                  min(original.size.width * original.scale, original.size.height * original.scale) >= 400,
                  min(image.size.width * image.scale, image.size.height * image.scale) >= 400 else {
                parent.complete(.failure(PhotoError(key: "validation.photoDimensions"))); return
            }
            // Normalize camera/library formats (including HEIC) to a square JPEG accepted by the API.
            let side = min(1600, min(image.size.width * image.scale, image.size.height * image.scale))
            let format = UIGraphicsImageRendererFormat(); format.scale = 1
            let square = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { _ in
                let scale = side / min(image.size.width, image.size.height)
                let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
                image.draw(in: CGRect(x: (side - size.width) / 2, y: (side - size.height) / 2, width: size.width, height: size.height))
            }
            guard let data = square.jpegData(compressionQuality: 0.9), data.count <= 5 * 1024 * 1024 else {
                parent.complete(.failure(PhotoError(key: "validation.photoTooLarge"))); return
            }
            parent.complete(.success(data))
        }
    }
}
struct PhotoError: LocalizedError {
    let key: String
    var errorDescription: String? { L.t(key, ["px": "400"]) }
}
