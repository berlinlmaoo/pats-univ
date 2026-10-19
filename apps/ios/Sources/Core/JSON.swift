import Foundation

/// Additive server fields are preserved, including nullable feature settings.
enum JSON: Codable, Equatable, Sendable, Identifiable {
    case null, bool(Bool), number(Double), string(String), array([JSON]), object([String: JSON])
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSON].self) { self = .array(a) }
        else { self = .object(try c.decode([String: JSON].self)) }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        }
    }
    subscript(_ key: String) -> JSON {
        get { if case .object(let v) = self { return v[key] ?? .null }; return .null }
        set { var v = object; v[key] = newValue; self = .object(v) }
    }
    var object: [String: JSON] { if case .object(let v) = self { return v }; return [:] }
    var rows: [JSON] { if case .array(let v) = self { return v }; return [] }
    var text: String {
        switch self {
        case .string(let v): return v
        case .number(let v): return Int(exactly: v).map(String.init) ?? String(v)
        default: return ""
        }
    }
    var int: Int { if case .number(let v) = self { return Int(exactly: v.rounded(.towardZero)) ?? 0 }; return Int(text) ?? 0 }
    var double: Double { if case .number(let v) = self { return v }; return Double(text) ?? 0 }
    var bool: Bool { self == .bool(true) }
    var exists: Bool { self != .null }
    var id: String { self["id"].text }
    var encoded: Data { (try? JSONEncoder().encode(self)) ?? Data() }
    var wire: String { String(data: encoded, encoding: .utf8) ?? "null" }
    static func parse(_ data: Data) throws -> JSON { try JSONDecoder().decode(JSON.self, from: data) }
    static func str(_ v: String) -> JSON { .string(v) }
    static func num(_ v: Int) -> JSON { .number(Double(v)) }
}

enum Dates {
    static func parse(_ s: String) -> Date? {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: s) ?? ISO8601DateFormatter().date(from: s)
    }
}

struct QRDeadline: Equatable {
    let token: String
    let expiresAt: Date
    let ttl: Double
    init(response: JSON, receivedAt: Date = Date(), requestStartedAt: Date? = nil) {
        token = response["token"].text
        ttl = max(1, response["ttlSeconds"].double)
        let server = Dates.parse(response["serverTime"].text) ?? receivedAt
        let expiry = Dates.parse(response["expiresAt"].text) ?? server
        let transit = requestStartedAt.map { max(0, receivedAt.timeIntervalSince($0)) } ?? 0
        expiresAt = receivedAt.addingTimeInterval(max(0, expiry.timeIntervalSince(server) - transit))
    }
    func remaining(at now: Date) -> Int { max(0, Int(ceil(expiresAt.timeIntervalSince(now)))) }
}

enum CardLink {
    static func token(_ input: String) -> String? {
        guard let r = input.range(of: #"/c/([A-Za-z0-9_-]{32})(?:$|[/?#])"#, options: .regularExpression) else { return nil }
        return String(input[r]).dropFirst(3).prefix(32).description
    }
}

func query(_ path: String, _ values: [String: String]) -> String {
    var c = URLComponents(string: path)!
    c.queryItems = values.filter { !$0.value.isEmpty }.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
    return c.string ?? path
}
