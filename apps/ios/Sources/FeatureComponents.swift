import SwiftUI
import CoreImage.CIFilterBuiltins

struct Room: Equatable { var kind: String; var id: String }
@MainActor struct DataPage<Content: View>: View {
    let title: String
    let path: String
    var room: Room?
    var poll = false
    @ViewBuilder var content: @MainActor (JSON, @escaping @MainActor () async -> Void) -> Content
    @StateObject private var resource = Resource()
    @StateObject private var live = RealtimeRoom()
    @Environment(\.scenePhase) private var phase
    var body: some View {
        Page(title: title) {
            ResourceState(resource: resource) { await load() }
            if live.accessLost { Notice(text: L.t("native.accessLost"), error: true) }
            else if resource.data.exists { content(resource.data, { await load() }) }
        }
        .task(id: path) {
            await load(); connect()
            if poll || room != nil {
                while !Task.isCancelled {
                    do { try await Task.sleep(for: .seconds(15)) } catch { break }
                    if phase == .active && !live.accessLost { await load() }
                }
            }
        }
        .refreshable { await load() }
        .onDisappear { live.stop() }
        .onChange(of: phase) { _, p in if p == .active { connect() } else { live.stop() } }
    }
    private func load() async { await resource.load(path) }
    private func connect() { if let room, phase == .active { live.start(kind: room.kind, id: room.id) { await load() } } }
}

@MainActor final class Mutation: ObservableObject {
    @Published var busy = false
    @Published var error: String?
    @Published var message: String?
    func run(_ operation: () async throws -> Void) async {
        guard !busy else { return }; busy = true; error = nil; message = nil
        defer { busy = false }
        do { try await operation() }
        catch is CancellationError { }
        catch { self.error = error.localizedDescription }
    }
    func send(_ path: String, body: JSON, method: String = "POST", after: () async -> Void = {}) async {
        await run { _ = try await APIClient.shared.call(method, path, body); message = L.t("native.saved"); await after() }
    }
}
struct MutationState: View {
    @ObservedObject var mutation: Mutation
    var body: some View {
        if mutation.busy { ProgressView().frame(maxWidth: .infinity) }
        if let error = mutation.error { Notice(text: error, error: true) }
        if let message = mutation.message { Notice(text: message) }
    }
}
struct ConfirmAction: View {
    var label: String
    var message: String
    var destructive = false
    var disabled = false
    var action: () async -> Void
    @State private var confirm = false
    var body: some View {
        Button(L.t(label), role: destructive ? .destructive : nil) { confirm = true }
            .buttonStyle(.bordered).frame(minHeight: 44).disabled(disabled)
            .alert(L.t(label), isPresented: $confirm) {
                Button(L.t("common.cancel"), role: .cancel) {}
                Button(L.t("native.confirm"), role: destructive ? .destructive : nil) { Task { await action() } }
            } message: { Text(message) }
    }
}
struct Choice: View {
    var label: String
    var options: [JSON]
    @Binding var selection: String
    var allowEmpty = false
    var body: some View {
        Picker(L.t(label), selection: $selection) {
            if allowEmpty || (selection.isEmpty && !options.contains { $0.id.isEmpty }) { Text(L.t("common.notSet")).tag("") }
            ForEach(options) { option in Text(option["name"].text.isEmpty ? option["title"].text : option["name"].text).tag(option.id) }
        }.pickerStyle(.menu).frame(minHeight: 44).frame(maxWidth: .infinity, alignment: .leading)
            .onAppear { selectDefault() }.onChange(of: options) { _, _ in selectDefault() }
    }
    private func selectDefault() {
        if !allowEmpty, !options.contains(where: { $0.id == selection }), let first = options.first { selection = first.id }
    }
}
struct NavigationRow<Destination: View>: View {
    let title: String
    var subtitle = ""
    var icon = "chevron.right"
    @ViewBuilder var destination: Destination
    var body: some View {
        NavigationLink { destination } label: {
            HStack(spacing: Theme.gap) {
                Image(systemName: icon).frame(width: 24).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text(L.t(title)).fontWeight(.semibold)
                    if !subtitle.isEmpty { Text(subtitle).font(Theme.body(13)).foregroundStyle(Theme.muted) }
                }
                Spacer(minLength: 0); Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.muted)
            }.frame(minHeight: 48).contentShape(Rectangle())
        }.buttonStyle(.plain)
    }
}
struct QRImage: View {
    let value: String
    var body: some View {
        Group {
            if let image = qr {
                Image(uiImage: image).interpolation(.none).resizable().scaledToFit()
                    .padding(16).background(Color.white).accessibilityLabel(L.t("app.cardQrA11y"))
            }
        }.frame(width: Theme.qr, height: Theme.qr)
    }
    private var qr: UIImage? {
        let filter = CIFilter.qrCodeGenerator(); filter.message = Data(value.utf8); filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        let color = CIFilter.falseColor(); color.inputImage = output
        color.color0 = CIColor(red: 0, green: 24.0/255, blue: 54.0/255); color.color1 = CIColor.white
        guard let result = color.outputImage, let cg = CIContext().createCGImage(result, from: result.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}
struct RemoteImage: View {
    var url: String
    var body: some View {
        AsyncImage(url: Config.mediaURL(url)) { phase in
            switch phase {
            case .success(let image): image.resizable().scaledToFit()
            case .failure: Image(systemName: "photo").foregroundStyle(Theme.muted).frame(height: 80)
            default: ProgressView().frame(height: 80)
            }
        }.frame(maxWidth: .infinity).clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
