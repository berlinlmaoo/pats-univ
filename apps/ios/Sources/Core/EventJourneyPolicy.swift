import Foundation

/// Lifecycle checks use server state and timestamps; local journey progress never awards attendance or XP.
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
}
