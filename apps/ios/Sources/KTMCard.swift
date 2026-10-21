import SwiftUI
import CoreText

/// Native geometry for the owner-provided 21 October artwork. Shared web/print geometry is unchanged.
private enum NativeKTMGeometry {
    static let ratio: CGFloat = 3213.0 / 2079.0
    static let radius: CGFloat = 0.037
    static let valueX: CGFloat = 0.0485
    static let valueCap: CGFloat = 0.0327
    static let nameY: CGFloat = 0.3832
    static let drinkY: CGFloat = 0.6121
    static let quoteY: CGFloat = 0.8285
    static let qrX: CGFloat = 0.704
    static let qrY: CGFloat = 0.543
    static let qrWidth: CGFloat = 0.232
}
/// The licensed face and tracking are retained; the drawing is bounded to each printed field.
struct CardValue: UIViewRepresentable {
    let value: String
    let width: CGFloat
    var maxLines = 1
    func makeUIView(context: Context) -> ValueDrawingView { ValueDrawingView() }
    func updateUIView(_ view: ValueDrawingView, context: Context) { view.value = value; view.cardWidth = width; view.maxLines = maxLines; view.setNeedsDisplay() }
}
final class ValueDrawingView: UIView {
    var value = ""
    var cardWidth: CGFloat = 0
    var maxLines = 1
    override init(frame: CGRect) { super.init(frame: frame); isOpaque = false; backgroundColor = .clear; isAccessibilityElement = false; clipsToBounds = true }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext(), bounds.width > 0, bounds.height > 0 else { return }
        let text = value.trimmingCharacters(in: .whitespacesAndNewlines).uppercased(with: Locale(identifier: "id_ID"))
        let fullSize = cardWidth * NativeKTMGeometry.valueCap / CardValueMetrics.capHeight
        var size = fullSize
        var lines: [CTLine] = []
        var offsets: [Int] = []
        repeat {
            let typesetter = CTTypesetterCreateWithAttributedString(Theme.cardTypeface.attributed(text, size: size))
            lines = []; offsets = []; var offset = 0
            while offset < text.utf16.count {
                let count = max(1, CTTypesetterSuggestLineBreak(typesetter, offset, Double(bounds.width)))
                offsets.append(offset); lines.append(CTTypesetterCreateLine(typesetter, CFRange(location: offset, length: count))); offset += count
            }
            if (lines.count <= maxLines && size * (0.82 + CGFloat(max(0, lines.count - 1)) * 0.95) <= bounds.height) || size <= fullSize * 0.28 { break }
            size = max(fullSize * 0.28, size * 0.92)
        } while true
        if lines.count > maxLines {
            let tail = (text as NSString).substring(from: offsets[maxLines - 1])
            let full = Theme.cardTypeface.line(tail, size: size)
            let ellipsis = Theme.cardTypeface.line("…", size: size)
            if let shortened = CTLineCreateTruncatedLine(full, Double(bounds.width), .end, ellipsis) { lines[maxLines - 1] = shortened }
        }
        let baseline = size * 0.7315
        let layout = CardValueLayout(lines: Array(lines.prefix(maxLines)), size: size, baseline: baseline, lineAdvance: size * 0.95)
        layout.draw(in: ctx)
    }
}
struct KTMCard: View {
    let member: JSON
    var token: String?
    var interactive = true
    @State private var flipped = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var label: String { L.t("ux.card.a11y", ["name": member["fullName"].text, "drink": member["favoriteDrink"].text, "quote": member["quotes"].text]) }
    var body: some View {
        VStack(spacing: Theme.gap) {
            GeometryReader { geometry in
                let w = geometry.size.width
                let h = w / NativeKTMGeometry.ratio
                ZStack {
                    front(width: w, height: h).modifier(CardFace(angle: flipped ? -180 : 0, reduceMotion: reduceMotion))
                    Image("KTMBack").resizable().scaledToFit().modifier(CardFace(angle: flipped ? 0 : 180, reduceMotion: reduceMotion))
                }.frame(width: w, height: h).clipShape(RoundedRectangle(cornerRadius: w * NativeKTMGeometry.radius))
                    .shadow(color: Color.black.opacity(0.18), radius: 8, y: 4)
                    .contentShape(Rectangle()).onTapGesture { if interactive { flip() } }
            }.aspectRatio(NativeKTMGeometry.ratio, contentMode: .fit)
                .accessibilityElement(children: .ignore).accessibilityLabel(label)
                .accessibilityValue(L.t(flipped ? "ktm.back" : "ktm.front"))
                .accessibilityAction(named: L.t("ktm.flip")) { if interactive { flip() } }
            if interactive { Button(L.t("ktm.flip"), systemImage: "arrow.triangle.2.circlepath") { flip() }.buttonStyle(PATSButtonStyle(variant: .secondary)) }
        }
    }
    private func flip() { withAnimation(.easeInOut(duration: reduceMotion ? 0.2 : 0.5)) { flipped.toggle() } }
    private func front(width w: CGFloat, height h: CGFloat) -> some View {
        ZStack(alignment: .topLeading) {
            Image("KTMFront").resizable().frame(width: w, height: h).accessibilityHidden(true)
            value(member["fullName"].text, y: NativeKTMGeometry.nameY, maxWidth: 0.64, w: w, h: h)
            value(member["favoriteDrink"].text, y: NativeKTMGeometry.drinkY, maxWidth: 0.60, w: w, h: h)
            value(member["quotes"].text, y: NativeKTMGeometry.quoteY, maxWidth: 0.47, w: w, h: h, lines: 2)
            if let token, !token.isEmpty {
                QRImage(value: token, onTile: true).frame(width: w * NativeKTMGeometry.qrWidth, height: w * NativeKTMGeometry.qrWidth)
                    .offset(x: w * NativeKTMGeometry.qrX, y: h * NativeKTMGeometry.qrY)
            }
        }
    }
    private func value(_ text: String, y: CGFloat, maxWidth: CGFloat, w: CGFloat, h: CGFloat, lines: Int = 1) -> some View {
        CardValue(value: text, width: w, maxLines: lines).frame(width: w * maxWidth, height: min(h * (1 - y - 0.03), w * NativeKTMGeometry.valueCap / CardValueMetrics.capHeight * CGFloat(lines) * 1.12))
            .offset(x: w * NativeKTMGeometry.valueX, y: h * y).accessibilityHidden(true)
    }
}
/// Backfaces disappear at 90 degrees; reduced motion uses a 200 ms crossfade.
private struct CardFace: AnimatableModifier {
    var angle: Double
    let reduceMotion: Bool
    var animatableData: Double { get { angle } set { angle = newValue } }
    func body(content: Content) -> some View {
        content.rotation3DEffect(.degrees(reduceMotion ? 0 : angle), axis: (x: 0, y: 1, z: 0), perspective: 0.5)
            .opacity(reduceMotion ? max(0, 1 - abs(angle) / 180) : (abs(angle) < 90 ? 1 : 0))
    }
}
struct MemberPhoto: View {
    let url: String
    var size: CGFloat = 72
    var body: some View {
        AsyncImage(url: Config.mediaURL(url)) { phase in
            if let image = phase.image { image.resizable().scaledToFill() }
            else { Image(systemName: "person.crop.square").font(.largeTitle).foregroundStyle(Theme.muted).frame(maxWidth: .infinity, maxHeight: .infinity).background(Theme.color("surfaceMuted")) }
        }.frame(width: size, height: size).clipShape(RoundedRectangle(cornerRadius: Theme.controlRadius)).accessibilityLabel(L.t("native.photo"))
    }
}

/// The full-screen presentation owns its refresh task because covering the card can cancel its task.
struct EnlargedQRView: View {
    @State private var deadline: QRDeadline?
    @StateObject private var resource = Resource()
    @StateObject private var attendance = Resource()
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    private let initialEvent: JSON
    private var event: JSON { attendance.data["event"].exists ? attendance.data["event"] : initialEvent }
    init(initial: QRDeadline?, event: JSON = .null) { _deadline = State(initialValue: initial); initialEvent = event }
    var body: some View {
        ZStack {
            Color(uiColor: UIColor(hex: Theme.colors["brand"]?["maroon"] ?? "#360c0c")).ignoresSafeArea()
            VStack(spacing: Theme.padding) {
                HStack { Spacer(); Button(L.t("common.close")) { dismiss() }.buttonStyle(.plain).frame(minWidth: 44, minHeight: 44) }
                Text(store.member["fullName"].text).font(Theme.title(24))
                Text(store.member["nim"].text + " · " + store.member["city"]["name"].text).font(Theme.body(14))
                if event.exists {
                    Text(event["title"].text).font(Theme.title(20)).multilineTextAlignment(.center)
                    Text(event["city"]["name"].text + " · " + L.date(event["startsAt"].text, zone: event["city"]["timezone"].text)).font(Theme.body(13))
                }
                Spacer(minLength: 0)
                if event["myCheckIn"].exists {
                    Image(systemName: "checkmark.circle.fill").font(.system(size: 68))
                    Text(L.t("ktm.checkedIn")).font(Theme.title(28))
                    Text(L.date(event["myCheckIn"]["checkedInAt"].text, zone: event["city"]["timezone"].text))
                    Text(L.t("ux.events.xpInWallet")).font(Theme.body(14)).multilineTextAlignment(.center)
                    Button(L.t("ux.card.returnJourney")) { dismiss(); store.tab = "events" }.buttonStyle(.plain).frame(minHeight: 44)
                } else if event.exists && !EventJourneyPolicy.checkInOpen(event) {
                    Text(L.t("ux.card.eventClosed")).font(Theme.title(20)).multilineTextAlignment(.center)
                    Button(L.t("ux.card.returnJourney")) { dismiss(); store.tab = "events" }.buttonStyle(.plain).frame(minHeight: 44)
                } else {
                    TimelineView(.periodic(from: .now, by: 1)) { time in
                        if let deadline, deadline.remaining(at: time.date) > 0 && phase == .active && resource.error == nil {
                            QRImage(value: deadline.token, onTile: true).padding(24)
                            Text(L.t("app.cardQrRefreshIn", ["seconds": L.count(deadline.remaining(at: time.date))])).font(Theme.body(13)).monospacedDigit()
                        } else if resource.loading { Text(L.t("common.loading")) }
                        else { Text(resource.error ?? L.t("native.expired")); Button(L.t("common.retry")) { Task { await refresh() } }.buttonStyle(.plain).frame(minHeight: 44) }
                    }
                    if event.exists { Text(L.t("ux.events.waitingCrew")).font(Theme.title(17)) }
                    if let error = attendance.error { Text(error).font(Theme.body(13)); Button(L.t("common.retry")) { Task { await refreshAttendance() } }.buttonStyle(.plain).frame(minHeight: 44) }
                }
                Spacer(minLength: 0)
            }.padding(Theme.padding).foregroundStyle(Color.white)
        }.task {
            UIApplication.shared.isIdleTimerDisabled = true
            if deadline == nil { await refresh() }; await refreshAttendance()
            while !Task.isCancelled {
                let delay = max(2, min(initialEvent.exists ? 5 : 30, (deadline?.expiresAt.timeIntervalSinceNow ?? 5) - 5))
                do { try await Task.sleep(for: .seconds(delay)) } catch { break }
                if phase == .active { await refresh(); await refreshAttendance() }
            }
        }.onDisappear { UIApplication.shared.isIdleTimerDisabled = false; deadline = nil }
            .onChange(of: phase) { _, value in
                UIApplication.shared.isIdleTimerDisabled = value == .active
                if value != .active { deadline = nil } else { Task { await refresh(); await refreshAttendance() } }
            }
    }
    private func refreshAttendance() async {
        guard !initialEvent.id.isEmpty else { return }
        await attendance.load("/api/events/\(initialEvent.id)")
        if attendance.data["event"].exists { store.cardEvent = attendance.data["event"] }
    }
    private func refresh() async {
        await resource.load("/api/me/card-token")
        deadline = resource.error == nil && !resource.data["token"].text.isEmpty ? QRDeadline(response: resource.data, receivedAt: resource.receivedAt, requestStartedAt: resource.requestedAt) : nil
    }
}
