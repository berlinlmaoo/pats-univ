import Foundation

/// Idempotency key for one chat draft, sent as `clientId` (server: unique per sender).
/// A retry of the same draft reuses the key, so a send whose acknowledgement was lost
/// is deduplicated instead of posted twice. Editing the text or attachment, or a
/// successful send, starts a new draft with a new key.
struct DraftSendKey: Equatable {
    private(set) var value: String
    private var draft: String
    init(text: String = "", attachment: String = "", make: () -> String = DraftSendKey.makeKey) {
        value = make(); draft = DraftSendKey.signature(text, attachment)
    }
    /// Call whenever the draft changes; a different text or attachment gets a new key.
    mutating func update(text: String, attachment: String, make: () -> String = DraftSendKey.makeKey) {
        let next = DraftSendKey.signature(text, attachment)
        guard next != draft else { return }
        draft = next; value = make()
    }
    /// Call after a successful send.
    mutating func reset(make: () -> String = DraftSendKey.makeKey) { draft = DraftSendKey.signature("", ""); value = make() }
    /// Matches the server's `^[A-Za-z0-9_-]{8,64}$`.
    static func makeKey() -> String { UUID().uuidString.lowercased() }
    private static func signature(_ text: String, _ attachment: String) -> String { text + "\u{0}" + attachment }
}
