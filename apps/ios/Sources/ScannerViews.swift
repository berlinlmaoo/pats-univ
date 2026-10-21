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
    private let torch = UIButton(type: .system)
    private var active = true
    private var delivered = false
    init(scanned: @escaping (String) -> Void) { self.scanned = scanned; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = .black
        label.font = UIFont(name: "Figtree-Regular", size: 15); label.textColor = .white; label.numberOfLines = 0; label.textAlignment = .center; label.text = L.t("app.scanHint")
        label.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(label)
        NSLayoutConstraint.activate([label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24), label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24), label.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -40)])
        torch.setTitle(L.t("app.scanTorch"), for: .normal); torch.setTitleColor(.white, for: .normal)
        torch.addTarget(self, action: #selector(toggleTorch), for: .touchUpInside); torch.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(torch)
        NSLayoutConstraint.activate([torch.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24), torch.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16), torch.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)])
        Task {
            guard await AVCaptureDevice.requestAccess(for: .video) else { label.text = L.t("native.permission"); return }
            guard active else { return }
            queue.async { self.configure() }
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
    @objc private func toggleTorch() {
        guard let device = AVCaptureDevice.default(for: .video), device.hasTorch else { return }
        do { try device.lockForConfiguration(); defer { device.unlockForConfiguration() }; device.torchMode = device.torchMode == .on ? .off : .on } catch { }
    }
    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard active, !delivered, let value = (metadataObjects.first as? AVMetadataMachineReadableCodeObject)?.stringValue else { return }
        delivered = true; scanned(value); stop()
    }
    func stop() { active = false; queue.async { [capture] in if capture.isRunning { capture.stopRunning() } } }
}
struct ScannerSheet: View {
    var event: JSON = .null
    var manualCheckIn: (() -> Void)?
    let scanned: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    @State private var permission = AVCaptureDevice.authorizationStatus(for: .video)
    var body: some View {
        NavigationStack {
            VStack(spacing: Theme.padding) {
                if event.exists { EventContextHeader(event: event).padding(.horizontal, Theme.padding) }
                if permission == .authorized {
                    QRScanner { code in dismiss(); scanned(code) }.ignoresSafeArea(edges: .bottom)
                } else {
                    Spacer()
                    Image(systemName: "camera").font(.system(size: 48)).foregroundStyle(Theme.muted)
                    Text(L.t(permission == .notDetermined ? "ux.camera.explain" : "ux.camera.denied")).multilineTextAlignment(.center)
                    if permission == .notDetermined {
                        Button(L.t("ux.camera.allow")) { Task { _ = await AVCaptureDevice.requestAccess(for: .video); permission = AVCaptureDevice.authorizationStatus(for: .video) } }.buttonStyle(PATSButtonStyle(variant: .maroon))
                    } else {
                        Button(L.t("ux.camera.settings")) { if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) } }.buttonStyle(PATSButtonStyle(variant: .maroon))
                    }
                    if let manualCheckIn { Button(L.t("app.scanManual")) { dismiss(); manualCheckIn() }.buttonStyle(PATSButtonStyle(variant: .secondary)) }
                    Button(L.t("common.close")) { dismiss() }.buttonStyle(PATSButtonStyle(variant: .secondary))
                    Spacer()
                }
            }.padding(permission == .authorized ? 0 : Theme.padding)
                .background(Theme.bg)
                .navigationTitle(L.t("app.scanHint")).navigationBarTitleDisplayMode(.inline).bandNavigation()
                .toolbar { ToolbarItem(placement: .topBarTrailing) { Button(L.t("common.close")) { dismiss() } } }
        }.onChange(of: phase) { _, value in if value == .active { permission = AVCaptureDevice.authorizationStatus(for: .video) } }
    }
}
struct ScanEventPicker: View {
    var body: some View {
        DataPage(title: "app.scanPickTitle", path: "/api/admin/home") { data, _ in
            let events = data["openEvents"].rows
            if events.isEmpty {
                EmptyState(title: "ux.workspace.noOpenEvent", message: "ux.scan.chooseToOpen", icon: "qrcode.viewfinder")
                if data["nextEvent"].exists {
                    let next = data["nextEvent"]
                    Panel {
                        EventContextHeader(event: next)
                        Text(L.t("ux.workspace.nextOpens", ["event": next["title"].text, "time": L.date(next["timing"]["checkInOpensAt"].text, zone: next["timing"]["timezone"].text)]))
                        NavigationRow(title: "ux.scan.manageEvent", icon: "calendar.badge.clock") { EventDetailView(eventID: next.id, admin: true) }
                    }
                }
                NavigationRow(title: "events.title", icon: "calendar") { EventsView(admin: true) }
            }
            ForEach(events) { event in
                Panel {
                    EventContextHeader(event: event)
                    NavigationRow(title: "app.adminScan", icon: "qrcode.viewfinder") { ScanView(eventID: event.id) }
                }
            }
        }
    }
}
struct ScanView: View {
    let eventID: String
    @EnvironmentObject private var store: AppStore
    var initialMemberID = ""
    @State private var reader: any CardReader = CoreNFCCardReader()
    @State private var camera = false
    @State private var manual = false
    @State private var pendingManual = false
    @State private var subject: JSON = .null
    @State private var preview: JSON = .null
    @State private var result: JSON = .null
    @State private var reason = ""
    @StateObject private var context = Resource()
    @StateObject private var mutation = Mutation()
    @Environment(\.scenePhase) private var phase
    private var event: JSON { context.data["event"] }
    private var canScan: Bool { store.managing && context.error == nil && context.data["lifecycle"]["canScan"].bool && EventJourneyPolicy.checkInOpen(event) }
    private var manualReason: String { reason.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var manualReasonValid: Bool { (3...200).contains(manualReason.utf16.count) }
    var body: some View {
        Page(title: "app.adminScan", eventContext: event) {
            ResourceState(resource: context) { await loadEvent() }
            if !store.managing { Notice(text: L.t("ux.workspace.enableAdmin")) }
            else if event.exists {
                Panel {
                    NavigationRow(title: "ux.scan.changeEvent", icon: "arrow.left.arrow.right") { ScanEventPicker() }
                }
                if !canScan {
                    Notice(text: L.t(EventJourneyPolicy.ended(event) ? "ux.scan.ended" : "ux.scan.notOpen"))
                    NavigationRow(title: "ux.scan.manageEvent", icon: "calendar") { EventDetailView(eventID: eventID, admin: true) }
                } else {
                    if reader.available {
                        Button(L.t("native.tap"), systemImage: "wave.3.right") {
                            Task { await mutation.run {
                                let scan = try await reader.read()
                                try await identify(.object(["method": .str("NFC"), "token": .str(scan.token), "nfcUid": .str(scan.uid)]))
                            } }
                        }.buttonStyle(PATSButtonStyle(loading: mutation.busy)).disabled(mutation.busy)
                    } else { Notice(text: L.t("native.nfcUnavailable")) }
                    Button(L.t("app.scanHint"), systemImage: "qrcode.viewfinder") { camera = true }.buttonStyle(PATSButtonStyle(variant: .secondary)).disabled(mutation.busy)
                    Button(L.t("app.scanManual"), systemImage: "person.text.rectangle") { manual = true }.buttonStyle(PATSButtonStyle(variant: .secondary)).disabled(mutation.busy)
                }
                MutationState(mutation: mutation)
                if result.exists {
                    Panel {
                        Label(L.t("app.resultCheckedIn"), systemImage: "checkmark.circle").font(Theme.title(20))
                        MemberIdentity(member: result["checkIn"]["member"])
                        Text(event["title"].text + " · " + event["city"]["name"].text)
                        Text(L.date(result["checkIn"]["checkedInAt"].text))
                        Text(L.t("app.adminCheckedInCount", ["count": L.count(result["count"].int)]))
                        Button(L.t("ux.scan.nextMember")) { result = .null; subject = .null; reason = "" }.buttonStyle(PATSButtonStyle(variant: .maroon))
                    }
                }
                if preview.exists {
                    Panel {
                        Text(L.t("ux.scan.confirmTarget", ["event": event["title"].text, "city": event["city"]["name"].text])).fontWeight(.semibold)
                        MemberIdentity(member: preview["member"])
                        if preview["roaming"].bool { Notice(text: L.t("app.resultRoaming", ["city": preview["member"]["city"]["name"].text])) }
                        if preview["capacityReached"].bool { Notice(text: L.t("app.resultCapacity")) }
                        if preview["issue"].exists { Notice(text: L.error(preview["issue"]["code"].text), error: true) }
                        if subject["method"].text == "MANUAL" {
                            Field(key: "native.manualReason", value: $reason).disabled(mutation.busy)
                            Text(L.t("app.manualReasonHint")).font(Theme.body(13))
                            if manualReason.utf16.count > 200 { Notice(text: L.t("validation.tooLong"), error: true) }
                        }
                        TimelineView(.periodic(from: .now, by: 1)) { time in
                            let manual = subject["method"].text == "MANUAL"
                            let remaining = max(0, Int(ceil((Dates.parse(preview["ticketExpiresAt"].text) ?? .distantPast).timeIntervalSince(time.date))))
                            if !manual { Text(L.t("app.resultExpiresIn", ["seconds": L.count(remaining)])) }
                            ConfirmAction(label: "app.resultConfirm", message: preview["member"]["fullName"].text + " · " + preview["member"]["nim"].text + "\n" + event["title"].text + " · " + event["city"]["name"].text, maroon: true, disabled: !canScan || mutation.busy || preview["issue"].exists || (manual ? !manualReasonValid : remaining <= 0)) {
                                await mutation.run {
                                    await loadEvent()
                                    guard canScan else { throw ScanUnavailable() }
                                    var body: [String: JSON] = ["eventId": .str(eventID), "method": subject["method"]]
                                    if manual { body["memberId"] = subject["memberId"]; body["reason"] = .str(manualReason) } else { body["ticket"] = preview["ticket"] }
                                    result = try await APIClient.shared.call("POST", "/api/admin/check-in", .object(body)); preview = .null
                                }
                            }
                        }
                    }
                }
            }
        }
        .sheet(isPresented: $camera, onDismiss: { if pendingManual { pendingManual = false; manual = true } }) {
            ScannerSheet(event: event, manualCheckIn: { pendingManual = true }) { code in Task { await mutation.run { try await identify(.object(["method": .str("APP_QR"), "token": .str(code)])) } } }
        }
        .sheet(isPresented: $manual) { NavigationStack { ManualMemberPicker(eventID: eventID, event: event) { member in manual = false; Task { await mutation.run { try await identify(.object(["method": .str("MANUAL"), "memberId": .str(member.id)])) } } } } }
        .task {
            await loadEvent()
            if !initialMemberID.isEmpty && canScan { await mutation.run { try await identify(.object(["method": .str("MANUAL"), "memberId": .str(initialMemberID)])) } }
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(15)) } catch { break }
                if phase == .active && store.managing { await loadEvent() }
            }
        }
        .onChange(of: mutation.busy) { _, busy in store.operationInProgress = busy }
        .navigationBarBackButtonHidden(mutation.busy)
        .interactiveDismissDisabled(mutation.busy)
        .onChange(of: store.managing) { _, enabled in
            if !enabled { reader.cancel(); context.data = .null; preview = .null; result = .null; camera = false; manual = false }
            else { Task { await loadEvent() } }
        }
        .onDisappear { reader.cancel(); if !mutation.busy { store.operationInProgress = false } }
    }
    private func loadEvent() async { guard store.managing else { return }; await context.load("/api/admin/events/\(eventID)/workspace") }
    private func identify(_ subject: JSON) async throws {
        preview = .null; result = .null; reason = ""; self.subject = subject
        await loadEvent(); guard canScan else { throw ScanUnavailable() }
        var body = subject.object; body["eventId"] = .str(eventID)
        preview = try await APIClient.shared.call("POST", "/api/admin/check-in/preview", .object(body))
        UINotificationFeedbackGenerator().notificationOccurred(preview["issue"].exists ? .warning : .success)
    }
}
private struct ScanUnavailable: LocalizedError { var errorDescription: String? { L.t("ux.scan.notOpen") } }
struct ManualMemberPicker: View {
    let eventID: String
    let event: JSON
    let selected: (JSON) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var term = ""
    @StateObject private var state = Resource()
    var body: some View {
        Page(title: "app.manualTitle", eventContext: event) {
            Field(key: "native.search", value: $term)
            if term.count < 2 { Notice(text: L.t("app.cardsSearchHint")) }
            ResourceState(resource: state) { await search() }
            ForEach(state.data["members"].rows) { member in
                Button { selected(member) } label: {
                    Panel {
                        Text(member["fullName"].text).font(Theme.title(17)); Text(member["nim"].text)
                        if member["checkedInAt"].exists { Text(L.t("app.manualCheckedIn", ["time": L.date(member["checkedInAt"].text)])) }
                    }
                }.buttonStyle(.plain).disabled(member["checkedInAt"].exists)
            }
            if state.data.exists && state.data["members"].rows.isEmpty { EmptyState(title: "app.manualEmptyTitle") }
        }.toolbar { ToolbarItem(placement: .topBarTrailing) { Button(L.t("common.close")) { dismiss() } } }
        .task(id: term) { do { try await Task.sleep(for: .milliseconds(350)) } catch { return }; await search() }
    }
    private func search() async { if term.count >= 2 { await state.load(query("/api/admin/events/\(eventID)/members", ["q": term])) } else { state.data = .null } }
}
struct MemberIdentity: View {
    let member: JSON
    var body: some View {
        MemberPhoto(url: member["photoUrl"].text)
        Text(member["fullName"].text).font(Theme.title(20)); Text(member["nim"].text).monospacedDigit()
        Text(member["city"]["name"].text.isEmpty ? member["cityName"].text : member["city"]["name"].text).foregroundStyle(Theme.muted)
        if member["status"].exists { Badge(value: member["status"].text) }
    }
}
