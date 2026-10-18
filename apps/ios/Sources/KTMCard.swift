import SwiftUI
import CoreText

/// Values use cap-top coordinates, rather than SwiftUI's text line box, just like print/web.
struct CardValue: UIViewRepresentable {
    let value: String
    let width: CGFloat
    func makeUIView(context: Context) -> ValueDrawingView { ValueDrawingView() }
    func updateUIView(_ view: ValueDrawingView, context: Context) { view.value = value.uppercased(); view.cardWidth = width; view.setNeedsDisplay() }
}
final class ValueDrawingView: UIView {
    var value = ""
    var cardWidth: CGFloat = 0
    override init(frame: CGRect) { super.init(frame: frame); isOpaque = false; backgroundColor = .clear; isAccessibilityElement = false }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }
        let size = cardWidth * KTMGeometry.valueCap / 0.7
        let font = CTFontCreateWithGraphicsFont(Theme.cardFont, size, nil, nil)
        let text = NSAttributedString(string: value, attributes: [.font: font, .kern: -0.04 * size, .foregroundColor: UIColor.black])
        let line = CTLineCreateWithAttributedString(text)
        let length = CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil))
        let scale = min(1, bounds.width / max(1, length))
        // Fit any legal value on one line; the cap top stays fixed as the font shrinks.
        ctx.translateBy(x: 0, y: CTFontGetCapHeight(font) * scale)
        ctx.scaleBy(x: scale, y: -scale); ctx.textPosition = .zero; CTLineDraw(line, ctx)
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
        CardValue(value: text, width: w).frame(width: w * maxWidth, height: w * KTMGeometry.valueCap * 1.6)
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
