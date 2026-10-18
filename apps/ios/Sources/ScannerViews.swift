import SwiftUI
import AVFoundation

struct QRScanner: UIViewControllerRepresentable {
    let scanned: (String) -> Void
    func makeUIViewController(context: Context) -> ScannerController { ScannerController(scanned: scanned) }
    func updateUIViewController(_ uiViewController: ScannerController, context: Context) {}
    static func dismantleUIViewController(_ uiViewController: ScannerController, coordinator: ()) { uiViewController.stop() }
}
final class ScannerController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    private let capture = AVCaptureSession()
    private let queue = DispatchQueue(label: "id.znetworks.patsuniv.qr")
    private let scanned: (String) -> Void
    private var preview: AVCaptureVideoPreviewLayer?
    private let label = UILabel()
    private var active = true
    private var delivered = false
    init(scanned: @escaping (String) -> Void) { self.scanned = scanned; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = .black
        label.textColor = .white; label.numberOfLines = 0; label.textAlignment = .center; label.text = L.t("app.scanHint")
        label.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(label)
        NSLayoutConstraint.activate([label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24), label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24), label.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -40)])
        Task {
            guard await AVCaptureDevice.requestAccess(for: .video) else { label.text = L.t("native.permission"); return }
            guard active else { return }
            queue.async { [weak self] in self?.configure() }
        }
    }
    private func configure() {
        guard let device = AVCaptureDevice.default(for: .video), let input = try? AVCaptureDeviceInput(device: device), capture.canAddInput(input) else {
            DispatchQueue.main.async { self.label.text = L.t("app.scanUnavailableBody") }; return
        }
        capture.beginConfiguration(); capture.addInput(input)
        let output = AVCaptureMetadataOutput()
        guard capture.canAddOutput(output) else { capture.commitConfiguration(); return }
        capture.addOutput(output); output.setMetadataObjectsDelegate(self, queue: .main); output.metadataObjectTypes = [.qr]; capture.commitConfiguration()
        DispatchQueue.main.async {
            guard self.active else { return }
            let layer = AVCaptureVideoPreviewLayer(session: self.capture); layer.videoGravity = .resizeAspectFill
            self.view.layer.insertSublayer(layer, at: 0); self.preview = layer; layer.frame = self.view.bounds
            self.queue.async { if self.active { self.capture.startRunning() } }
        }
    }
    override func viewDidLayoutSubviews() { super.viewDidLayoutSubviews(); preview?.frame = view.bounds }
    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard active, !delivered, let value = (metadataObjects.first as? AVMetadataMachineReadableCodeObject)?.stringValue else { return }
        delivered = true; scanned(value); stop()
    }
    func stop() { active = false; queue.async { [capture] in if capture.isRunning { capture.stopRunning() } } }
}
struct ScannerSheet: View {
    let scanned: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            QRScanner { code in dismiss(); scanned(code) }.ignoresSafeArea(edges: .bottom)
                .navigationTitle(L.t("app.scanHint")).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .topBarTrailing) { Button(L.t("common.close")) { dismiss() } } }
        }
    }
}
struct ScanEventPicker: View {
    var body: some View {
        DataPage(title: "app.scanPickTitle", path: "/api/admin/events") { data, _ in
            let events = (data["upcoming"].rows + data["past"].rows).filter { $0["phase"].text == "open" }
            if events.isEmpty { EmptyState(title: "app.scanNoOpenTitle", message: "app.scanNoOpenBody", icon: "qrcode.viewfinder") }
            ForEach(events) { e in Panel { NavigationRow(title: e["title"].text, subtitle: L.date(e["startsAt"].text), icon: "qrcode.viewfinder") { ScanView(eventID: e.id) } } }
        }
    }
}
struct ScanView: View {
    let eventID: String
    var initialMemberID = ""
    @State private var reader: any CardReader = CoreNFCCardReader()
    @State private var camera = false
    @State private var subject: JSON = .null
    @State private var preview: JSON = .null
    @State private var result: JSON = .null
    @State private var reason = ""
    @StateObject private var mutation = Mutation()
    var body: some View {
        Page(title: "app.adminScan") {
            if reader.available {
                Button(L.t("native.tap"), systemImage: "wave.3.right") {
                    Task { await mutation.run {
                        let scan = try await reader.read()
                        try await identify(.object(["method": .str("NFC"), "token": .str(scan.token), "nfcUid": .str(scan.uid)]))
                    } }
                }.buttonStyle(PATSButtonStyle()).disabled(mutation.busy)
            } else { Notice(text: L.t("native.nfcUnavailable")) }
            Button(L.t("app.scanHint"), systemImage: "qrcode.viewfinder") { camera = true }.buttonStyle(.bordered).disabled(mutation.busy)
            NavigationRow(title: "app.scanManual", icon: "person.text.rectangle") { ManualCheckInView(eventID: eventID) }
            MutationState(mutation: mutation)
            if result.exists {
                Panel { Label(L.t("app.resultCheckedIn"), systemImage: "checkmark.circle").font(Theme.title(20)); Text(result["checkIn"]["member"]["fullName"].text); Text(L.date(result["checkIn"]["checkedInAt"].text)); Text(L.t("app.adminCheckedInCount", ["count": L.count(result["count"].int)])) }
            }
            if preview.exists {
                Panel {
                    MemberIdentity(member: preview["member"])
                    if preview["roaming"].bool { Notice(text: L.t("app.resultRoaming", ["city": preview["member"]["city"]["name"].text])) }
                    if preview["capacityReached"].bool { Notice(text: L.t("app.resultCapacity")) }
                    if preview["issue"].exists { Notice(text: L.error(preview["issue"]["code"].text), error: true) }
                    if subject["method"].text == "MANUAL" { Field(key: "native.manualReason", value: $reason); Text(L.t("app.manualReasonHint")).font(Theme.body(13)) }
                    TimelineView(.periodic(from: .now, by: 1)) { time in
                        let manual = subject["method"].text == "MANUAL"
                        let remaining = max(0, Int(ceil((Dates.parse(preview["ticketExpiresAt"].text) ?? .distantPast).timeIntervalSince(time.date))))
                        if !manual { Text(L.t("app.resultExpiresIn", ["seconds": L.count(remaining)])) }
                        ConfirmAction(label: "app.resultConfirm", message: preview["member"]["fullName"].text + " · " + preview["member"]["nim"].text, disabled: mutation.busy || preview["issue"].exists || (manual ? reason.trimmingCharacters(in: .whitespacesAndNewlines).count < 3 : remaining <= 0)) {
                            await mutation.run {
                                var body: [String: JSON] = ["eventId": .str(eventID), "method": subject["method"]]
                                if manual { body["memberId"] = subject["memberId"]; body["reason"] = .str(reason) } else { body["ticket"] = preview["ticket"] }
                                result = try await APIClient.shared.call("POST", "/api/admin/check-in", .object(body)); preview = .null
                            }
                        }
                    }
                }
            }
        }
        .sheet(isPresented: $camera) { ScannerSheet { code in Task { await mutation.run { try await identify(.object(["method": .str("APP_QR"), "token": .str(code)])) } } } }
        .task { if !initialMemberID.isEmpty { await mutation.run { try await identify(.object(["method": .str("MANUAL"), "memberId": .str(initialMemberID)])) } } }
        .onDisappear { reader.cancel() }
    }
    private func identify(_ subject: JSON) async throws {
        preview = .null; result = .null; self.subject = subject
        var body = subject.object; body["eventId"] = .str(eventID)
        preview = try await APIClient.shared.call("POST", "/api/admin/check-in/preview", .object(body))
    }
}
struct MemberIdentity: View {
    let member: JSON
    var body: some View {
        if !member["photoUrl"].text.isEmpty { RemoteImage(url: member["photoUrl"].text).frame(height: 80) }
        Text(member["fullName"].text).font(Theme.title(20)); Text(member["nim"].text).monospacedDigit()
        Text(member["city"]["name"].text).foregroundStyle(Theme.muted)
    }
}
struct ManualCheckInView: View {
    let eventID: String
    @State private var term = ""
    @StateObject private var state = Resource()
    var body: some View {
        Page(title: "app.manualTitle") {
            Field(key: "native.search", value: $term)
            if term.count < 2 { Notice(text: L.t("app.cardsSearchHint")) }
            ResourceState(resource: state) { await search() }
            ForEach(state.data["members"].rows) { member in
                Panel {
                    NavigationRow(title: member["fullName"].text, subtitle: member["nim"].text, icon: "person") { ScanView(eventID: eventID, initialMemberID: member.id) }
                    if member["checkedInAt"].exists { Text(L.t("app.manualCheckedIn", ["time": L.date(member["checkedInAt"].text)])) }
                }
            }
            if state.data.exists && state.data["members"].rows.isEmpty { EmptyState(title: "app.manualEmptyTitle") }
        }.task(id: term) {
            do { try await Task.sleep(for: .milliseconds(350)) } catch { return }
            await search()
        }
    }
    private func search() async { if term.count >= 2 { await state.load(query("/api/admin/events/\(eventID)/members", ["q": term])) } else { state.data = .null } }
}
