import Foundation

/// A display preference belongs to one authenticated identity and one backend origin.
/// It never grants permissions and cannot be restored into a different account.
final class AdminModePreferences {
    private let defaults: UserDefaults
    private let ownerKey = "pats.ux.admin.owner"
    private let modeKey = "pats.ux.admin.enabled"
    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    static func owner(origin: String, userID: String) -> String { origin + "|" + userID }

    func activate(owner: String, fresh: Bool, authorized: Bool) -> Bool {
        let same = defaults.string(forKey: ownerKey) == owner
        if fresh || !same || !authorized { defaults.set(false, forKey: modeKey) }
        defaults.set(owner, forKey: ownerKey)
        return authorized && defaults.bool(forKey: modeKey)
    }
    @discardableResult func save(_ enabled: Bool, owner: String, authorized: Bool) -> Bool {
        guard defaults.string(forKey: ownerKey) == owner else { return false }
        let value = enabled && authorized
        defaults.set(value, forKey: modeKey)
        return value
    }
    func reset() { defaults.removeObject(forKey: ownerKey); defaults.removeObject(forKey: modeKey) }
}

/// Explicit task payloads take precedence over an incidental event identifier.
enum UXNotificationTarget: Equatable {
    case personalCard, event(String), claims(String), claimReview(String), cardRequest(String)
    case payments(String), recap(String), scan(String), channel(String), conversation(String)
    case community, requests(String), adminRequests(String), roaming(String), regionChange, wallet, notifications
    case task(JSON)

    static func resolve(_ data: JSON) -> UXNotificationTarget {
        if data["target"].exists { return resolve(data["target"]) }
        if data.object.keys.contains("requiresAdminMode") || !data["actionKey"].text.isEmpty {
            var target = data
            if data["screen"].text.hasPrefix("admin") { target["requiresAdminMode"] = .bool(true) }
            return .task(target)
        }
        if ["eventBroadcast", "reminder3d", "reminder1d", "reminderToday", "thankYou", "fomo"].contains(data["kind"].text) {
            var target = data; target["screen"] = .str(data["eventId"].text.isEmpty ? "notifications" : "event"); target["requiresAdminMode"] = .bool(false); return .task(target)
        }
        let kinds: [String: (String, Bool)] = [
            "reservationRequested": ("adminReservations", true), "reservationDecided": ("reservation", false),
            "roamingRequested": ("adminRoaming", true), "roamingDecided": ("roaming", false),
            "claimDecided": ("claims", false), "reencodeApproved": ("adminMemberCard", true), "reencodeRejected": ("adminMemberCard", true),
            "contentSubmitted": ("adminContentQueue", true), "contentDecided": ("adminEventContent", true),
            "cardShipped": ("card", false), "cardDelivered": ("card", false), "checkIn": ("attendance", false),
            "hubMention": (data["conversationId"].text.isEmpty ? "hub" : "conversation", true)
        ]
        if let (name, staff) = kinds[data["kind"].text] {
            var target = data; target["screen"] = .str(name); target["requiresAdminMode"] = .bool(staff); return .task(target)
        }
        if data["screen"].text.hasPrefix("admin") {
            var target = data; target["requiresAdminMode"] = .bool(true); return .task(target)
        }
        let screen = data["screen"].text.lowercased().replacingOccurrences(of: "_", with: "-")
        let event = data["eventId"].text
        switch screen {
        case "claims", "claim": return .claims(event)
        case "claims-review", "admin-claims", "claim-review": return .claimReview(event)
        case "membercard", "member-card", "card-request", "reencode", "re-encode": return .cardRequest(data["memberId"].text)
        case "payments", "payment": return .payments(event)
        case "recap", "traffic-recap": return .recap(event)
        case "scan", "check-in": return .scan(event)
        case "card", "ktm": return .personalCard
        case "reservations": return .requests(event)
        case "social-operations": return .adminRequests(event)
        case "roaming": return .roaming(event)
        case "region-change", "home-city-change": return .regionChange
        case "rewards", "wallet": return .wallet
        default: break
        }
        if !data["conversationId"].text.isEmpty { return .conversation(data["conversationId"].text) }
        if !data["channelId"].text.isEmpty { return .channel(data["channelId"].text) }
        if !event.isEmpty { return .event(event) }
        if screen == "hub" || screen == "community" { return .community }
        return .notifications
    }
}
