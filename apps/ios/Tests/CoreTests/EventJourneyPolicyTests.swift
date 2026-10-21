import XCTest
@testable import PATSCore

final class EventJourneyPolicyTests: XCTestCase {
    private let now = Dates.parse("2026-10-21T15:00:00Z")!
    private func event(status: String = "OPEN", phase: String = "open", opens: String = "2026-10-21T14:00:00Z", closes: String = "2026-10-21T16:00:00Z", ends: String = "2026-10-21T16:00:00Z", city: String = "home", attended: Bool = false) -> JSON {
        .object(["id": .str("event-a"), "status": .str(status), "phase": .str(phase), "checkInOpensAt": .str(opens), "checkInClosesAt": .str(closes), "endsAt": .str(ends), "city": .object(["id": .str(city)]), "myCheckIn": attended ? .object(["checkedInAt": .str("2026-10-21T14:30:00Z")]) : .null])
    }
    func testOnlyOpenEventsInsideTheirCheckInWindowAllowScanning() {
        XCTAssertTrue(EventJourneyPolicy.checkInOpen(event(), at: now))
        XCTAssertFalse(EventJourneyPolicy.checkInOpen(event(status: "CLOSED", phase: "closed"), at: now))
        XCTAssertFalse(EventJourneyPolicy.checkInOpen(event(status: "PUBLISHED", phase: "upcoming"), at: now))
        XCTAssertFalse(EventJourneyPolicy.checkInOpen(event(status: "DRAFT", phase: "draft"), at: now))
        XCTAssertFalse(EventJourneyPolicy.checkInOpen(event(opens: "2026-10-21T15:01:00Z"), at: now))
        XCTAssertFalse(EventJourneyPolicy.checkInOpen(event(closes: "2026-10-21T15:00:00Z"), at: now))
    }
    func testEndedOrIncompleteEventCannotBeScanned() {
        XCTAssertFalse(EventJourneyPolicy.checkInOpen(event(phase: "ended"), at: now))
        XCTAssertFalse(EventJourneyPolicy.checkInOpen(event(ends: "2026-10-21T14:59:00Z"), at: now))
        XCTAssertFalse(EventJourneyPolicy.checkInOpen(.null, at: now))
        XCTAssertFalse(EventJourneyPolicy.checkInOpen(.object(["status": .str("OPEN")]), at: now))
    }
    func testCheckInOpensAtStartOfWindow() {
        XCTAssertTrue(EventJourneyPolicy.checkInOpen(event(opens: "2026-10-21T15:00:00Z"), at: now))
    }
    func testHomeCityClaimIsAvailableAfterEventWithoutInventingAttendanceRequirement() {
        let ended = event(status: "CLOSED", phase: "ended")
        XCTAssertTrue(EventJourneyPolicy.claimEligible(ended, memberCityID: "home", at: now))
        XCTAssertFalse(EventJourneyPolicy.claimEligible(event(), memberCityID: "home", at: now))
        XCTAssertFalse(EventJourneyPolicy.claimEligible(event(status: "DRAFT", phase: "ended"), memberCityID: "home", at: now))
    }
    func testVisitingCityClaimRequiresRecordedAttendance() {
        XCTAssertFalse(EventJourneyPolicy.claimEligible(event(phase: "ended", city: "visit"), memberCityID: "home", at: now))
        XCTAssertTrue(EventJourneyPolicy.claimEligible(event(phase: "ended", city: "visit", attended: true), memberCityID: "home", at: now))
        XCTAssertFalse(EventJourneyPolicy.claimEligible(event(phase: "ended", attended: true), memberCityID: "", at: now))
    }
    func testMemberActionsFollowServerAvailabilityWithoutLocalOverride() {
        let value: JSON = .object(["actions": .array([
            .object(["key": .str("showQr"), "available": .bool(false), "reason": .str("roamingRequired")]),
            .object(["key": .str("claimXp"), "available": .bool(true), "reason": .null])
        ])])
        XCTAssertFalse(EventJourneyPolicy.actionAvailable("showQr", in: value))
        XCTAssertEqual(EventJourneyPolicy.actionReason("showQr", in: value), "roamingRequired")
        XCTAssertTrue(EventJourneyPolicy.actionAvailable("claimXp", in: value))
        XCTAssertNil(EventJourneyPolicy.actionReason("claimXp", in: value))
        XCTAssertFalse(EventJourneyPolicy.actionAvailable("reserve", in: value))
        XCTAssertFalse(EventJourneyPolicy.actionAvailable("showQr", in: .null))
    }
}
