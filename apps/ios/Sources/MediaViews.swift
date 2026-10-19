import SwiftUI
import AVKit
import UniformTypeIdentifiers

struct CapturedMedia {
    let data: Data
    let contentType: String
    let kind: String
}
enum CaptureMode: String, Identifiable { case photo, video; var id: String { rawValue } }
struct CameraCapture: UIViewControllerRepresentable {
    let mode: CaptureMode
    var maxSeconds: Int = 30
    let complete: (Result<CapturedMedia, Error>) -> Void
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let p = UIImagePickerController(); p.sourceType = .camera; p.cameraDevice = .rear
        p.mediaTypes = mode == .photo ? [UTType.image.identifier] : [UTType.movie.identifier]
        p.videoMaximumDuration = Double(maxSeconds); p.videoQuality = .typeMedium
        p.delegate = context.coordinator; return p
    }
    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraCapture
        init(_ parent: CameraCapture) { self.parent = parent }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.complete(.failure(CancellationError())) }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage, let data = image.jpegData(compressionQuality: 0.7) {
                parent.complete(.success(CapturedMedia(data: data, contentType: "image/jpeg", kind: "IMAGE")))
            } else if let url = info[.mediaURL] as? URL {
                Task {
                    let destination = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".mp4")
                    defer { try? FileManager.default.removeItem(at: destination); try? FileManager.default.removeItem(at: url) }
                    guard let exporter = AVAssetExportSession(asset: AVURLAsset(url: url), presetName: AVAssetExportPresetMediumQuality) else { parent.complete(.failure(APIError(code: "MEDIA_INVALID"))); return }
                    exporter.outputURL = destination; exporter.outputFileType = .mp4
                    await exporter.export()
                    if exporter.status == .completed, let data = try? Data(contentsOf: destination, options: .mappedIfSafe) {
                        parent.complete(.success(CapturedMedia(data: data, contentType: "video/mp4", kind: "VIDEO")))
                    } else { parent.complete(.failure(APIError(code: "MEDIA_INVALID"))) }
                }
            } else { parent.complete(.failure(APIError(code: "MEDIA_INVALID"))) }
        }
    }
}

@MainActor final class VoiceRecorder: NSObject, ObservableObject, AVAudioRecorderDelegate {
    @Published var recording = false
    private var recorder: AVAudioRecorder?
    private var url: URL?
    private var callback: ((Result<CapturedMedia, Error>) -> Void)?
    func start(seconds: Int, completion: @escaping (Result<CapturedMedia, Error>) -> Void) async {
        guard !recording else { return }
        guard await AVAudioApplication.requestRecordPermission() else { completion(.failure(APIError(code: "FORBIDDEN"))); return }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker]); try session.setActive(true)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".m4a")
            self.url = url; callback = completion
            let recorder = try AVAudioRecorder(url: url, settings: [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44100, AVNumberOfChannelsKey: 1, AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue])
            self.recorder = recorder; recorder.delegate = self
            guard recorder.record(forDuration: Double(max(1, min(120, seconds)))) else { throw APIError(code: "MEDIA_INVALID") }
            recording = true
        } catch { cancel(); completion(.failure(error)) }
    }
    func stop() { recorder?.stop() }
    func cancel() {
        callback = nil; recorder?.delegate = nil; recorder?.stop(); recorder = nil; recording = false
        if let url { try? FileManager.default.removeItem(at: url) }; url = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
    nonisolated func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        Task { @MainActor in
            let cb = callback
            let data = url.flatMap { try? Data(contentsOf: $0) }
            cancel()
            if flag, let data { cb?(.success(CapturedMedia(data: data, contentType: "audio/mp4", kind: "VOICE"))) }
            else { cb?(.failure(APIError(code: "MEDIA_INVALID"))) }
        }
    }
    deinit { recorder?.stop(); if let url { try? FileManager.default.removeItem(at: url) } }
}
struct CaptureControls: View {
    var imageOnly = false
    var maxSeconds = 30
    var busy = false
    let complete: (CapturedMedia) async throws -> Void
    @State private var mode: CaptureMode?
    @State private var error: String?
    @StateObject private var voice = VoiceRecorder()
    @State private var uploading = false
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.gap) {
            if let error { Notice(text: error, error: true) }
            HStack {
                Button(L.t("native.photo"), systemImage: "camera") { Task { await open(.photo) } }
                if !imageOnly {
                    Button(L.t("native.video"), systemImage: "video") { Task { await open(.video) } }
                    Button(L.t(voice.recording ? "native.stop" : "native.voice"), systemImage: voice.recording ? "stop.circle" : "mic") {
                        if voice.recording { voice.stop() }
                        else { Task { await voice.start(seconds: maxSeconds) { receive($0) } } }
                    }
                }
            }.buttonStyle(PATSButtonStyle(variant: .secondary)).disabled(busy || uploading)
            if voice.recording { TimelineView(.periodic(from: .now, by: 1)) { _ in Label(L.t("native.record"), systemImage: "record.circle").foregroundStyle(Theme.danger) } }
            if uploading { Text(L.t("loyalty.uploading")).font(Theme.body(13)).accessibilityAddTraits(.updatesFrequently) }
        }
        .sheet(item: $mode) { mode in CameraCapture(mode: mode, maxSeconds: maxSeconds) { result in self.mode = nil; receive(result) }.ignoresSafeArea() }
        .onDisappear { voice.cancel() }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.willResignActiveNotification)) { _ in voice.cancel() }
    }
    private func open(_ kind: CaptureMode) async {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else { error = L.t("native.permission"); return }
        let camera = await AVCaptureDevice.requestAccess(for: .video)
        let mic = kind == .video ? await AVCaptureDevice.requestAccess(for: .audio) : true
        guard camera && mic else { error = L.t("native.permission"); return }
        error = nil; mode = kind
    }
    private func receive(_ result: Result<CapturedMedia, Error>) {
        Task { @MainActor in
            uploading = true; error = nil; defer { uploading = false }
            do { try await complete(result.get()) }
            catch is CancellationError { }
            catch { self.error = error.localizedDescription }
        }
    }
}
struct ReceiptCaptureView: View {
    @Binding var key: String
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.gap) {
            Text(L.t("phase5.optionalReceipt")).font(Theme.body(13))
            if !key.isEmpty { Label(L.t("loyalty.uploaded"), systemImage: "checkmark.circle") }
            CaptureControls(imageOnly: true) { media in
                guard media.data.count <= 5 * 1024 * 1024 else { throw APIError(code: "MEDIA_INVALID") }
                let signed = try await APIClient.shared.call("POST", "/api/loyalty/receipt-upload", .object(["contentType": .str(media.contentType)]))
                guard let url = Config.mediaURL(signed["uploadUrl"].text) else { throw APIError(code: "MEDIA_INVALID") }
                try await APIClient.shared.upload(media.data, to: url, contentType: media.contentType)
                key = signed["key"].text
            }
        }
    }
}
struct MediaPlayback: View {
    let url: String
    let kind: String
    @State private var player: AVPlayer?
    var body: some View {
        Group {
            if kind == "IMAGE" { RemoteImage(url: url).frame(maxHeight: 300) }
            else if let player {
                VideoPlayer(player: player).frame(height: kind == "VOICE" ? 72 : 248).clipShape(RoundedRectangle(cornerRadius: Theme.controlRadius))
            }
        }.task(id: url) { if kind != "IMAGE", let u = Config.mediaURL(url) { player?.pause(); player = AVPlayer(url: u) } }
            .onDisappear { player?.pause(); player = nil }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.willResignActiveNotification)) { _ in player?.pause() }
    }
}
struct PrivateReceiptButton: View {
    let path: String
    @StateObject private var mutation = Mutation()
    @State private var url: String?
    var body: some View {
        VStack {
            Button(L.t("loyalty.viewReceipt")) {
                Task { await mutation.run { url = try await APIClient.shared.call("GET", path)["url"].text } }
            }.buttonStyle(PATSButtonStyle(variant: .secondary)).disabled(mutation.busy)
            MutationState(mutation: mutation)
        }.sheet(isPresented: Binding(get: { url != nil }, set: { if !$0 { url = nil } })) {
            NavigationStack {
                ScrollView { RemoteImage(url: url ?? "").padding() }.background(Theme.bg)
                    .navigationTitle(L.t("loyalty.viewReceipt")).navigationBarTitleDisplayMode(.inline).bandNavigation()
                    .toolbar { ToolbarItem(placement: .topBarTrailing) { Button(L.t("common.close")) { url = nil } } }
            }
        }
    }
}
