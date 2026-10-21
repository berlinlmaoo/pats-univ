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
    static func count(_ v: Int) -> String { v.formatted(.number.locale(Locale(identifier: "id_ID"))) }
    static func money(_ v: Int) -> String { "Rp " + v.formatted(.number.locale(Locale(identifier: "id_ID"))) }
    static func date(_ s: String, zone: String = "Asia/Jakarta") -> String {
        guard let date = Dates.parse(s) else { return s }
        let f = DateFormatter(); f.locale = Locale(identifier: locale == "id" ? "id_ID" : "en_GB")
        f.timeZone = TimeZone(identifier: zone) ?? TimeZone(identifier: "Asia/Jakarta")!
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = f.timeZone
        f.dateFormat = calendar.component(.year, from: date) == calendar.component(.year, from: Date()) ? "d MMM · HH.mm" : "d MMM yyyy · HH.mm"
        return f.string(from: date) + " " + zoneName(zone, at: date)
    }
    static func zoneName(_ zone: String, at date: Date) -> String {
        ["Asia/Jakarta": "WIB", "Asia/Pontianak": "WIB", "Asia/Makassar": "WITA", "Asia/Jayapura": "WIT"][zone] ?? TimeZone(identifier: zone)?.abbreviation(for: date) ?? "WIB"
    }
    static func inputDate(_ date: Date, time: Bool = false, zone: TimeZone = TimeZone(identifier: "Asia/Jakarta")!) -> String {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_GB"); f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = zone; f.dateFormat = time ? "HH.mm" : "dd/MM/yyyy"
        return f.string(from: date)
    }
    static func activePeriod(mode: String, start: String, end: String) -> String {
        guard let date = Dates.parse(start), let reset = Dates.parse(end) else { return "" }
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(identifier: "Asia/Jakarta")!
        let f = DateFormatter(); f.locale = Locale(identifier: locale == "en" ? "en_GB" : "id_ID"); f.timeZone = calendar.timeZone
        f.dateFormat = "MMM yyyy"
        let period = mode == "QUARTERLY" ? "Q\((calendar.component(.month, from: date) - 1) / 3 + 1) \(calendar.component(.year, from: date))" : f.string(from: date)
        f.dateFormat = "d MMM"
        return t("ktm.periodReset", ["period": period, "date": f.string(from: reset)])
    }
    static func status(_ raw: String) -> String {
        let explicit = t(raw); if explicit != raw { return explicit }
        let publicKeys = ["ACTIVE": "cardPage.statusActive", "INACTIVE": "cardPage.statusDeactivated", "active": "cardPage.active", "pending": "cardPage.pending", "revoked": "cardPage.revokedTitle", "inactive": "cardPage.inactiveTitle", "paid": "phase5.paid", "unpaid": "phase5.unpaid"]
        if let key = publicKeys[raw] { return t(key) }
        for key in ["cardStatus.\(raw)", "eventPhase.\(raw)", "checkInMethod.\(raw)", "role.\(raw)", "phase5.\(raw)", "social.\(raw)", "loyalty.\(raw)", "events.\(raw)"] {
            let result = t(key); if result != key { return result }
        }
        return raw.replacingOccurrences(of: "_", with: " ").localizedCapitalized
    }
}
