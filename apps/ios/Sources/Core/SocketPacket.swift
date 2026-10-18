import Foundation

/// Socket.IO v4 / Engine.IO v4 text packets, matching the NEXUS websocket transport.
enum SocketPacket: Equatable {
    case open, ping(String), connected, closed
    case event(String, JSON)
    case ack(Int, JSON)
    case unsupported
    static func parse(_ text: String) -> SocketPacket {
        if text.hasPrefix("0") { return .open }
        if text.hasPrefix("2") { return .ping(String(text.dropFirst())) }
        if text.hasPrefix("40") { return .connected }
        if text == "1" || text.hasPrefix("41") || text.hasPrefix("44") { return .closed }
        guard text.hasPrefix("42") || text.hasPrefix("43"), let bracket = text.firstIndex(of: "["),
              let payload = try? JSON.parse(Data(text[bracket...].utf8)), case .array(let values) = payload else { return .unsupported }
        if text.hasPrefix("43") {
            guard let id = Int(text[text.index(text.startIndex, offsetBy: 2)..<bracket]) else { return .unsupported }
            return .ack(id, values.first ?? .null)
        }
        guard let name = values.first, !name.text.isEmpty else { return .unsupported }
        return .event(name.text, values.count > 1 ? values[1] : .null)
    }
    static func emit(_ name: String, value: JSON, ack: Int) -> String { "42\(ack)" + JSON.array([.str(name), value]).wire }
}
