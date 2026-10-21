import SwiftUI
import CoreText

enum Theme {
    static let gap: CGFloat = 12
    static let padding: CGFloat = 16
    static let radius: CGFloat = 10
    static let controlRadius: CGFloat = 6
    static let control: CGFloat = 48
    static let qr: CGFloat = 224
    static let colors: [String: [String: String]] = {
        guard let u = Bundle.main.url(forResource: "colors", withExtension: "json"), let d = try? Data(contentsOf: u),
              let result = try? JSONDecoder().decode([String: [String: String]].self, from: d) else { return [:] }
        return result
    }()
    static func uiColor(_ key: String) -> UIColor {
        UIColor { traits in UIColor(hex: colors[traits.userInterfaceStyle == .dark ? "dark" : "light"]?[key] ?? "#001836") }
    }
    static func color(_ key: String) -> Color { Color(uiColor: uiColor(key)) }
    static let bg = color("bg"), surface = color("surface"), muted = color("textMuted"), text = color("text")
    static let accent = color("accentText"), border = color("border"), danger = color("dangerText")
    static func title(_ size: CGFloat = 26) -> Font { .custom("Figtree-Regular", size: size, relativeTo: .title2).weight(.heavy) }
    static func body(_ size: CGFloat = 15) -> Font { .custom("Figtree-Regular", size: size, relativeTo: .body) }
    static var label: Font { body(11).weight(.heavy) }
    /// Never fatal: CardTypeface logs and falls back (file data, then a system heavy face).
    static let cardTypeface = CardTypeface(url: Bundle.main.url(forResource: "card-value", withExtension: "ttf"))

}
extension UIColor {
    convenience init(hex: String) {
        let n = UInt64(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0
        self.init(red: Double((n >> 16) & 255)/255, green: Double((n >> 8) & 255)/255, blue: Double(n & 255)/255, alpha: 1)
    }
}

/// Graduate's 0.045 em outline matches the shared varsityStroke token.
struct VarsityText: UIViewRepresentable {
    var text: String
    var size: CGFloat = VarsityScale.Small.size
    @Environment(\.dynamicTypeSize) private var dynamicType
    func makeUIView(context: Context) -> UILabel {
        let label = UILabel(); label.adjustsFontSizeToFitWidth = true; label.minimumScaleFactor = 0.5
        label.textAlignment = .center; label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return label
    }
    func updateUIView(_ label: UILabel, context: Context) {
        let scaled = min(size * 1.4, UIFontMetrics(forTextStyle: .headline).scaledValue(for: size))
        label.attributedText = NSAttributedString(string: text.uppercased(), attributes: [
            .font: UIFont(name: "Graduate-Regular", size: scaled)!, .foregroundColor: Theme.uiColor("bandText"),
            .strokeColor: Theme.uiColor("bandText"), .strokeWidth: -4.5, .kern: scaled * 0.02
        ])
        label.accessibilityLabel = text
    }
    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UILabel, context: Context) -> CGSize? {
        let size = uiView.intrinsicContentSize
        return CGSize(width: min(proposal.width ?? size.width, size.width), height: size.height + 4)
    }
}
struct BandNavigation: ViewModifier {
    func body(content: Content) -> some View {
        content.toolbarBackground(Theme.color("band"), for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar).toolbarColorScheme(.dark, for: .navigationBar)
            .safeAreaInset(edge: .top, spacing: 0) { Theme.color("gold").frame(height: 3) }
    }
}
extension View { func bandNavigation() -> some View { modifier(BandNavigation()) } }

struct PATSButtonStyle: ButtonStyle {
    enum Variant { case primary, secondary, ghost, danger, maroon }
    var variant: Variant = .primary
    var loading = false
    @Environment(\.isEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var fill: Color {
        guard enabled else { return .clear }
        switch variant { case .primary: return Theme.color("primary"); case .secondary: return Theme.surface; case .ghost: return .clear; case .danger: return Theme.color("dangerSolid"); case .maroon: return Theme.color("secondary") }
    }
    private var ink: Color {
        guard enabled else { return Theme.muted }
        switch variant { case .primary: return Theme.color("primaryText"); case .secondary, .ghost: return Theme.text; case .danger: return Theme.color("onSolid"); case .maroon: return Theme.color("secondaryText") }
    }
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(loading ? 0 : 1).font(Theme.body()).fontWeight(.bold).multilineTextAlignment(.center)
            .padding(.horizontal, Theme.gap).padding(.vertical, 8)
            .frame(maxWidth: .infinity, minHeight: Theme.control)
            .background(fill, in: RoundedRectangle(cornerRadius: Theme.controlRadius))
            .overlay(RoundedRectangle(cornerRadius: Theme.controlRadius).strokeBorder(enabled && variant != .secondary ? .clear : Theme.color("borderStrong"), style: StrokeStyle(lineWidth: 1, dash: enabled ? [] : [4, 3])))
            .overlay { if loading { ProgressView().tint(ink).accessibilityLabel(L.t("common.loading")) } }
            .foregroundStyle(ink).scaleEffect(configuration.isPressed && !reduceMotion ? 0.98 : 1)
    }
}
struct Panel<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.gap) { content }
            .frame(maxWidth: .infinity, alignment: .leading).padding(Theme.padding)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radius))
            .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.border, lineWidth: 1))
            .shadow(color: Color(uiColor: UIColor(hex: "#001836")).opacity(0.06), radius: 3, y: 1)
    }
}
struct SectionLabel: View {
    let key: String
    var body: some View { Text(L.t(key).uppercased()).font(Theme.label).tracking(0.66).foregroundStyle(Theme.muted) }
}
struct CardHeading: View {
    let key: String
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Theme.color("gold").frame(width: 24, height: 3).accessibilityHidden(true)
            Text(L.t(key)).font(Theme.title(17))
        }
    }
}
struct DetailRow: View {
    let key: String
    let value: String
    var body: some View { VStack(alignment: .leading, spacing: 4) { SectionLabel(key: key); Text(value).monospacedDigit() }.accessibilityElement(children: .combine) }
}
struct EmptyState: View {
    var title = "native.empty"
    var message = "native.emptyBody"
    var icon = "tray"
    var body: some View {
        VStack(spacing: Theme.gap) {
            Image(systemName: icon).font(.title2).foregroundStyle(Theme.color("bandText"))
                .frame(width: 48, height: 48).background(Theme.color("band"), in: RoundedRectangle(cornerRadius: 6))
                .overlay(alignment: .bottom) { Theme.color("gold").frame(height: 3) }.accessibilityHidden(true)
            Text(L.t(title)).font(Theme.title(17))
            Text(L.t(message)).font(Theme.body()).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
        }.frame(maxWidth: .infinity).padding(Theme.padding)
    }
}
struct Notice: View {
    var text: String
    var error = false
    var tone = "info"
    private var semantic: String { error ? "danger" : tone == "info" ? "accent" : tone }
    var body: some View {
        Label(text, systemImage: error ? "exclamationmark.circle" : tone == "success" ? "checkmark.circle" : "info.circle")
            .font(Theme.body(14)).foregroundStyle(Theme.color(semantic == "accent" ? "accentSubtleText" : "\(semantic)Text"))
            .frame(maxWidth: .infinity, alignment: .leading).padding(Theme.padding)
            .background(Theme.color("\(semantic)Subtle"), in: RoundedRectangle(cornerRadius: Theme.controlRadius))
            .accessibilityAddTraits(error ? .updatesFrequently : [])
    }
}
struct Skeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.padding) {
            RoundedRectangle(cornerRadius: Theme.controlRadius).frame(height: 160)
            RoundedRectangle(cornerRadius: 4).frame(width: 160, height: 20)
            RoundedRectangle(cornerRadius: 4).frame(height: 48)
        }.foregroundStyle(Theme.color("surfaceMuted")).accessibilityLabel(L.t("common.loading"))
    }
}
struct Page<Content: View>: View {
    let title: String
    var eventContext: JSON = .null
    @ViewBuilder var content: Content
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: Theme.padding) { content }.padding(Theme.padding).padding(.bottom, Theme.padding).frame(maxWidth: 720).frame(maxWidth: .infinity) }
            .background(Theme.bg).navigationTitle("").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .principal) { VarsityText(text: L.t(title)).accessibilityAddTraits(.isHeader) } }
            .bandNavigation()
            .safeAreaInset(edge: .top, spacing: 0) { if eventContext.exists { EventScopeBar(event: eventContext) } }
    }
}
struct EventScopeBar: View {
    let event: JSON
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(event["title"].text).font(Theme.body(14)).bold().lineLimit(1)
            Text(event["city"]["name"].text + " · " + L.date(event["startsAt"].text, zone: event["city"]["timezone"].text.isEmpty ? "Asia/Jakarta" : event["city"]["timezone"].text)).font(Theme.body(12)).foregroundStyle(Theme.muted).lineLimit(1)
        }.frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, Theme.padding).padding(.vertical, 8).background(Theme.surface)
            .overlay(alignment: .bottom) { Theme.border.frame(height: 1) }.accessibilityElement(children: .combine)
    }
}
struct Field: View {
    var key: String
    @Binding var value: String
    var keyboard: UIKeyboardType = .default
    var money = false
    var focus: FocusState<String?>.Binding?
    var focusKey: String?
    @FocusState private var focused: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            SectionLabel(key: key)
            input.keyboardType(keyboard).padding(Theme.gap).frame(minHeight: Theme.control)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.controlRadius))
                .overlay(RoundedRectangle(cornerRadius: Theme.controlRadius).stroke(Theme.color(isFocused ? "accent" : "borderStrong"), lineWidth: isFocused ? 2 : 1))
                .accessibilityLabel(L.t(key))
        }
    }
    private var isFocused: Bool { focused || (focusKey != nil && focus?.wrappedValue == focusKey) }
    @ViewBuilder private var input: some View {
        if let focus {
            TextField(L.t(key), text: displayValue, axis: keyboard == .default ? .vertical : .horizontal).focused(focus, equals: focusKey)
        } else {
            TextField(L.t(key), text: displayValue, axis: keyboard == .default ? .vertical : .horizontal).focused($focused)
        }
    }
    private var displayValue: Binding<String> {
        guard money else { return $value }
        return Binding(get: { value.isEmpty ? "" : L.money(Int(value) ?? 0) }, set: { value = String($0.filter { $0.isASCII && $0.isNumber }.prefix(10)) })
    }

}
struct Badge: View {
    var value: String
    var member = false
    private var tone: String {
        if ["REVOKED", "REJECTED", "INACTIVE", "inactive", "revoked"].contains(value) { return "danger" }
        if ["DELIVERED", "APPROVED", "CONFIRMED", "FULFILLED", "open", "active", "ACTIVE", "ktm.checkedIn", "ux.card.ready"].contains(value) { return "success" }
        if ["PENDING", "ENCODED", "EXPIRED", "CLOSED", "closed"].contains(value) { return "warning" }
        if ["IN_BATCH", "SENT_TO_VENDOR", "RECEIVED_HQ", "upcoming", "ISSUED"].contains(value) { return "accent" }
        return "neutral"
    }
    var body: some View {
        Text((member ? L.t("cardStatusMember.\(value)") : value.hasPrefix("ktm.") ? L.t(value) : L.status(value)).uppercased()).font(Theme.label).tracking(0.55)
            .padding(.horizontal, 8).padding(.vertical, 4).frame(minHeight: 24)
            .background(Theme.color(tone == "neutral" ? "surfaceMuted" : "\(tone)Subtle"), in: RoundedRectangle(cornerRadius: 4))
            .foregroundStyle(tone == "neutral" ? Theme.muted : Theme.color(tone == "accent" ? "accentSubtleText" : "\(tone)Text"))
    }
}
struct CountChip: View {
    let count: Int
    var body: some View { Text(L.count(count)).font(Theme.label).monospacedDigit().padding(4).background(Theme.color("secondary"), in: RoundedRectangle(cornerRadius: 4)).foregroundStyle(Theme.color("secondaryText")) }
}
struct Tabs: View {
    let options: [(String, String)]
    @Binding var selection: String
    var counts: [String: Int] = [:]
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Theme.padding) {
                ForEach(options, id: \.0) { value, key in
                    Button { selection = value } label: {
                        HStack { Text(L.t(key).uppercased()).font(Theme.label).tracking(0.44); if let count = counts[value], count > 0 { CountChip(count: count) } }
                            .padding(.horizontal, 4).frame(minHeight: Theme.control)
                            .foregroundStyle(selection == value ? Theme.text : Theme.muted)
                            .overlay(alignment: .bottom) { if selection == value { Theme.color("gold").frame(height: 3) } }
                    }.buttonStyle(.plain).accessibilityAddTraits(selection == value ? .isSelected : [])
                }
            }
        }
    }
}
