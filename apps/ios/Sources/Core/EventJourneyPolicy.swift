import Foundation

/// Presentation follows server state. The client never awards attendance, proof approval or XP.
enum EventJourneyPolicy {
    static func ended(_ event: JSON, at now: Date = .now) -> Bool {
        event["phase"].text == "ended" || (Dates.parse(event["endsAt"].text).map { $0 <= now } ?? false)
    }
    static func checkInOpen(_ event: JSON, at now: Date = .now) -> Bool {
        event["status"].text == "OPEN" && !ended(event, at: now) &&
        (Dates.parse(event["checkInOpensAt"].text).map { $0 <= now } ?? false) &&
        (Dates.parse(event["checkInClosesAt"].text).map { now < $0 } ?? false)
    }
    static func claimEligible(_ event: JSON, memberCityID: String, at now: Date = .now) -> Bool {
        ended(event, at: now) && event["status"].text != "DRAFT" && !memberCityID.isEmpty &&
        (event["city"].id == memberCityID || event["myCheckIn"].exists)
    }
    static func actionAvailable(_ key: String, in event: JSON) -> Bool {
        event["actions"].rows.first { $0["key"].text == key }?["available"].bool ?? false
    }
    static func actionReason(_ key: String, in event: JSON) -> String? {
        guard let action = event["actions"].rows.first(where: { $0["key"].text == key }), !action["available"].bool else { return nil }
        let reason = action["reason"].text
        return reason.isEmpty ? nil : reason
    }
    static func optional(_ step: JSON) -> Bool { step["optional"].bool || step["state"].text == "optional" }
    static func currentRequiredStep(_ steps: [JSON]) -> JSON {
        steps.first { !optional($0) && $0["state"].text == "current" } ?? .null
    }
    static func requiredStepsComplete(_ steps: [JSON]) -> Bool {
        let required = steps.filter { !optional($0) }
        return !required.isEmpty && required.allSatisfy { $0["state"].text == "done" }
    }
    static func posterURL(_ event: JSON) -> String {
        if event["poster"].exists { return event["poster"]["url"].text }
        return event["flyerUrl"].text
    }
    static func canUploadPosterProof(event: JSON, step: JSON) -> Bool {
        guard step["key"].text == "poster", !posterURL(event).isEmpty else { return false }
        let proof = step["proof"]
        return !proof.exists || ["PENDING", "REJECTED"].contains(proof["status"].text)
    }
    static func canSkipPosterProof(_ step: JSON) -> Bool {
        step["key"].text == "poster" && !step["proof"].exists && step["outcome"].text != "skipped" && step["state"].text != "done"
    }
    static func posterAwardedXP(_ step: JSON) -> Int? {
        let proof = step["proof"]
        guard proof["status"].text == "APPROVED", proof["xpAwarded"].exists else { return nil }
        return proof["xpAwarded"].int
    }
}
