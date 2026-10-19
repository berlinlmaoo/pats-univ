import SwiftUI
import CoreText

/// Values use cap-top coordinates, rather than SwiftUI's text line box, just like print/web.
struct CardValue: UIViewRepresentable {
    let value: String
    let width: CGFloat
    func makeUIView(context: Context) -> ValueDrawingView { ValueDrawingView() }
    func updateUIView(_ view: ValueDrawingView, context: Context) { view.value = value; view.cardWidth = width; view.setNeedsDisplay() }
}
final class ValueDrawingView: UIView {
    var value = ""
    var cardWidth: CGFloat = 0
    override init(frame: CGRect) { super.init(frame: frame); isOpaque = false; backgroundColor = .clear; isAccessibilityElement = false }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }
        Theme.cardTypeface.layout(value, cardWidth: cardWidth, maxWidth: bounds.width).draw(in: ctx)
    }
}
struct KTMCard: View {
    let member: JSON
    var token: String?
    var interactive = true
    @State private var flipped = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var label: String { L.t("ktm.a11y", ["name": member["fullName"].text, "drink": member["favoriteDrink"].text, "genre": member["favoriteGenre"].text]) }
    var body: some View {
        VStack(spacing: Theme.gap) {
            GeometryReader { geometry in
                let w = geometry.size.width
                let h = w / KTMGeometry.ratio
                ZStack {
                    front(width: w, height: h).modifier(CardFace(angle: flipped ? -180 : 0, reduceMotion: reduceMotion))
                    Image("KTMBack").resizable().scaledToFit().modifier(CardFace(angle: flipped ? 0 : 180, reduceMotion: reduceMotion))
                }.frame(width: w, height: h).clipShape(RoundedRectangle(cornerRadius: w * KTMGeometry.radius))
                    .shadow(color: Color.black.opacity(0.18), radius: 8, y: 4)
                    .contentShape(Rectangle()).onTapGesture { if interactive { flip() } }
            }.aspectRatio(KTMGeometry.ratio, contentMode: .fit)
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
            value(member["fullName"].text, y: KTMGeometry.nameY, maxWidth: KTMGeometry.nameMaxW, w: w, h: h)
            value(member["favoriteDrink"].text, y: KTMGeometry.drinkY, maxWidth: KTMGeometry.valueMaxW, w: w, h: h)
            value(member["favoriteGenre"].text, y: KTMGeometry.genreY, maxWidth: KTMGeometry.valueMaxW, w: w, h: h)
            if let token, !token.isEmpty {
                QRImage(value: token, onTile: true).frame(width: w * KTMGeometry.Qr.w, height: w * KTMGeometry.Qr.w)
                    .offset(x: w * KTMGeometry.Qr.x, y: h * KTMGeometry.Qr.y)
            }
        }
    }
    private func value(_ text: String, y: CGFloat, maxWidth: CGFloat, w: CGFloat, h: CGFloat) -> some View {
        CardValue(value: text, width: w).frame(width: w * maxWidth, height: w * KTMGeometry.valueCap / CardValueMetrics.capHeight * 3.2)
            .offset(x: w * KTMGeometry.valueX, y: h * y).accessibilityHidden(true)
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
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    init(initial: QRDeadline?) { _deadline = State(initialValue: initial) }
    var body: some View {
        ZStack {
            Color(uiColor: UIColor(hex: Theme.colors["brand"]?["maroon"] ?? "#360c0c")).ignoresSafeArea()
            VStack(spacing: Theme.padding) {
                HStack { Spacer(); Button(L.t("common.close")) { dismiss() }.buttonStyle(.plain).frame(minWidth: 44, minHeight: 44) }
                Spacer()
                TimelineView(.periodic(from: .now, by: 1)) { time in
                    if let deadline, deadline.remaining(at: time.date) > 0 && phase == .active && resource.error == nil {
                        QRImage(value: deadline.token, onTile: true).padding(24)
                    } else if resource.loading { Text(L.t("common.loading")) }
                    else { Text(resource.error ?? L.t("native.expired")); Button(L.t("common.retry")) { Task { await refresh() } }.buttonStyle(.plain).frame(minHeight: 44) }
                }
                Spacer()
            }.padding(Theme.padding).foregroundStyle(Color.white)
        }.task {
            UIApplication.shared.isIdleTimerDisabled = true
            if deadline == nil { await refresh() }
            while !Task.isCancelled {
                let delay = max(2, min(30, (deadline?.expiresAt.timeIntervalSinceNow ?? 5) - 5))
                do { try await Task.sleep(for: .seconds(delay)) } catch { break }
                if phase == .active { await refresh() }
            }
        }.onDisappear { UIApplication.shared.isIdleTimerDisabled = false; deadline = nil }
            .onChange(of: phase) { _, value in
                UIApplication.shared.isIdleTimerDisabled = value == .active
                if value != .active { deadline = nil } else { Task { await refresh() } }
            }
    }
    private func refresh() async {
        await resource.load("/api/me/card-token")
        deadline = resource.error == nil ? QRDeadline(response: resource.data, receivedAt: resource.receivedAt, requestStartedAt: resource.requestedAt) : nil
    }
}
