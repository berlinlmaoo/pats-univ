import SwiftUI

enum Theme {
    static let gap: CGFloat = 12
    static let padding: CGFloat = 16
    static let radius: CGFloat = 20
    static let control: CGFloat = 48
    static let qr: CGFloat = 224
    static let colors: [String: [String: String]] = {
        guard let u = Bundle.main.url(forResource: "colors", withExtension: "json"), let d = try? Data(contentsOf: u),
              let result = try? JSONDecoder().decode([String: [String: String]].self, from: d) else { return [:] }
        return result
    }()
    static func color(_ key: String) -> Color {
        Color(uiColor: UIColor { traits in
            let hex = colors[traits.userInterfaceStyle == .dark ? "dark" : "light"]?[key] ?? "#001836"
            return UIColor(hex: hex)
        })
    }
    static let bg = color("bg"), surface = color("surface"), muted = color("textMuted"), text = color("text")
    static let accent = color("accentText"), border = color("border"), danger = color("dangerText")
    static func title(_ size: CGFloat = 26) -> Font { .custom("PlusJakartaSans-Bold", size: size, relativeTo: .title2) }
    static func body(_ size: CGFloat = 15) -> Font { .custom("Inter-Regular", size: size, relativeTo: .body) }
}
extension UIColor {
    convenience init(hex: String) {
        let n = UInt64(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0
        self.init(red: Double((n >> 16) & 255)/255, green: Double((n >> 8) & 255)/255, blue: Double(n & 255)/255, alpha: 1)
    }
}
struct PATSButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(Theme.body()).fontWeight(.semibold)
            .frame(maxWidth: .infinity, minHeight: Theme.control)
            .background(Theme.color("primary"), in: RoundedRectangle(cornerRadius: 12))
            .foregroundStyle(Theme.color("primaryText"))
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}
struct Panel<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.gap) { content }
            .frame(maxWidth: .infinity, alignment: .leading).padding(Theme.padding)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radius))
            .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.border, lineWidth: 1))
    }
}
struct EmptyState: View {
    var title = "native.empty"
    var message = "native.emptyBody"
    var icon = "tray"
    var body: some View {
        VStack(spacing: Theme.gap) {
            Image(systemName: icon).font(.title2).frame(width: 44, height: 44).background(Theme.color("surfaceMuted"), in: RoundedRectangle(cornerRadius: 12))
            Text(L.t(title)).font(Theme.title(17))
            Text(L.t(message)).font(Theme.body()).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
        }.frame(maxWidth: .infinity).padding(Theme.padding * 2)
    }
}
struct Notice: View {
    var text: String
    var error = false
    var body: some View {
        Text(text).font(Theme.body(14)).foregroundStyle(error ? Theme.danger : Theme.muted)
            .frame(maxWidth: .infinity, alignment: .leading).padding(Theme.padding)
            .background(Theme.color(error ? "dangerSubtle" : "surfaceMuted"), in: RoundedRectangle(cornerRadius: 12))
            .accessibilityAddTraits(error ? .updatesFrequently : [])
    }
}
struct Page<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: Theme.padding) { content }.padding(Theme.padding).frame(maxWidth: 720).frame(maxWidth: .infinity) }
            .background(Theme.bg).navigationTitle(L.t(title)).navigationBarTitleDisplayMode(.inline)
    }
}
struct Field: View {
    var key: String
    @Binding var value: String
    var keyboard: UIKeyboardType = .default
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(L.t(key)).font(Theme.body(14)).foregroundStyle(Theme.muted)
            TextField(L.t(key), text: $value, axis: keyboard == .default ? .vertical : .horizontal)
                .keyboardType(keyboard).padding(Theme.gap).frame(minHeight: Theme.control)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.color("borderStrong")))
                .accessibilityLabel(L.t(key))
        }
    }
}
struct Badge: View {
    var value: String
    var member = false
    private var tone: String {
        if ["REVOKED", "REJECTED", "INACTIVE", "inactive", "revoked"].contains(value) { return "danger" }
        if ["DELIVERED", "APPROVED", "CONFIRMED", "FULFILLED", "open", "active"].contains(value) { return "success" }
        if ["ENCODED", "EXPIRED", "CLOSED", "closed"].contains(value) { return "warning" }
        return "accent"
    }
    var body: some View {
        Text(member ? L.t("cardStatusMember.\(value)") : L.status(value)).font(Theme.body(13))
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(Theme.color("\(tone)Subtle"), in: Capsule()).foregroundStyle(Theme.color("\(tone)SubtleText"))
    }
}
