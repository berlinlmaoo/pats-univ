import Foundation

enum L {
    static var locale: String { UserDefaults.standard.string(forKey: "locale") ?? "id" }
    static func t(_ key: String, _ params: [String: String] = [:]) -> String {
        let bundle = Bundle.main.path(forResource: locale, ofType: "lproj").flatMap(Bundle.init(path:)) ?? .main
        var text = bundle.localizedString(forKey: key, value: nil, table: nil)
        for (k, v) in params { text = text.replacingOccurrences(of: "{\(k)}", with: v) }
        return text
    }
    static func error(_ code: String, params: [String: JSON] = [:]) -> String {
        let aliases = ["VALIDATION": "validation.invalid", "INTERNAL": "errors.generic", "INSUFFICIENT_XP": "loyalty.insufficientXp", "REWARD_UNAVAILABLE": "loyalty.unavailable", "CHECK_IN_REQUIRED": "loyalty.checkInRequired", "REDEEM_USED": "loyalty.codeUsed", "REDEEM_EXPIRED": "loyalty.codeExpired"]
        let parts = code.lowercased().split(separator: "_")
        let camel = (parts.first.map(String.init) ?? "generic") + parts.dropFirst().map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined()
        let key = aliases[code] ?? "errors.\(camel)"
        let value = t(key, params.mapValues(\.text))
        return value == key ? t("errors.generic") : value
    }
    static func count(_ v: Int) -> String { v.formatted(.number.locale(Locale(identifier: locale == "id" ? "id_ID" : "en_US"))) }
    static func money(_ v: Int) -> String { "Rp " + v.formatted(.number.locale(Locale(identifier: "id_ID"))) }
    static func date(_ s: String, zone: String = "Asia/Jakarta") -> String {
        guard let date = Dates.parse(s) else { return s }
        let f = DateFormatter(); f.locale = Locale(identifier: locale == "id" ? "id_ID" : "en_GB")
        f.timeZone = TimeZone(identifier: zone); f.dateFormat = "d MMM yyyy · HH.mm z"
        return f.string(from: date)
    }
    static func status(_ raw: String) -> String {
        for key in ["cardStatus.\(raw)", "eventPhase.\(raw)", "checkInMethod.\(raw)", "role.\(raw)", "phase5.\(raw)", "loyalty.\(raw)", "social.\(raw)", "events.\(raw)"] {
            let result = t(key); if result != key { return result }
        }
        return raw.replacingOccurrences(of: "_", with: " ").localizedCapitalized
    }
}
