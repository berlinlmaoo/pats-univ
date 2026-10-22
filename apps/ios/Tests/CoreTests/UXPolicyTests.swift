import XCTest
@testable import PATSCore

final class UXPolicyTests: XCTestCase {
    private func preferences() -> (AdminModePreferences, UserDefaults) {
        let suite = "PATSUXTests." + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return (AdminModePreferences(defaults: defaults), defaults)
    }
    func testExplicitModeRestoresOnlyForSameSignedInIdentity() {
        let (p, _) = preferences()
        XCTAssertFalse(p.activate(owner: "dev|crew", fresh: true, authorized: true))
        XCTAssertTrue(p.save(true, owner: "dev|crew", authorized: true))
        XCTAssertTrue(p.activate(owner: "dev|crew", fresh: false, authorized: true))
        XCTAssertFalse(p.activate(owner: "dev|member", fresh: false, authorized: false))
        XCTAssertFalse(p.activate(owner: "dev|crew", fresh: false, authorized: true))
    }
    func testLogoutAndNewAuthenticationResetModeEvenForSameAccount() {
        let (p, _) = preferences()
        _ = p.activate(owner: "dev|crew", fresh: true, authorized: true)
        p.save(true, owner: "dev|crew", authorized: true)
        p.reset()
        XCTAssertFalse(p.activate(owner: "dev|crew", fresh: false, authorized: true))
        p.save(true, owner: "dev|crew", authorized: true)
        XCTAssertFalse(p.activate(owner: "dev|crew", fresh: true, authorized: true))
    }
    func testBackendChangeRevocationAndStaleWritesCannotRestoreAdminMode() {
        let (p, _) = preferences()
        _ = p.activate(owner: "dev|crew", fresh: true, authorized: true)
        p.save(true, owner: "dev|crew", authorized: true)
        XCTAssertFalse(p.activate(owner: "other|crew", fresh: false, authorized: true))
        XCTAssertFalse(p.save(true, owner: "dev|crew", authorized: true))
        p.save(true, owner: "other|crew", authorized: true)
        XCTAssertFalse(p.activate(owner: "other|crew", fresh: false, authorized: false))
        XCTAssertFalse(p.save(true, owner: "other|crew", authorized: false))
    }
    func testTaskNotificationDoesNotCollapseToGenericEventDetail() {
        XCTAssertEqual(UXNotificationTarget.resolve(.object(["screen": .str("claims"), "eventId": .str("e")])), .claims("e"))
        XCTAssertEqual(UXNotificationTarget.resolve(.object(["screen": .str("memberCard"), "memberId": .str("m"), "eventId": .str("e")])), .cardRequest("m"))
        XCTAssertEqual(UXNotificationTarget.resolve(.object(["screen": .str("social-operations"), "eventId": .str("e")])), .adminRequests("e"))
        XCTAssertEqual(UXNotificationTarget.resolve(.object(["screen": .str("claims-review"), "eventId": .str("e")])), .claimReview("e"))
    }
    func testConversationAndChannelPayloadsKeepTheirSpecificDestination() {
        XCTAssertEqual(UXNotificationTarget.resolve(.object(["conversationId": .str("c"), "eventId": .str("e")])), .conversation("c"))
        XCTAssertEqual(UXNotificationTarget.resolve(.object(["screen": .str("hub"), "channelId": .str("h")])), .channel("h"))
        XCTAssertEqual(UXNotificationTarget.resolve(.object(["screen": .str("roaming"), "eventId": .str("e")])), .roaming("e"))
        XCTAssertEqual(UXNotificationTarget.resolve(.null), .notifications)
    }
    func testContractPushKindPreservesExactBookingAndStaffModeRequirement() {
        let data: JSON = .object(["kind": .str("reservationRequested"), "screen": .str("social-operations"), "eventId": .str("e"), "reservationId": .str("r")])
        guard case .task(let target) = UXNotificationTarget.resolve(data) else { return XCTFail("Expected a canonical task") }
        XCTAssertEqual(target["screen"].text, "adminReservations")
        XCTAssertEqual(target["reservationId"].text, "r")
        XCTAssertEqual(target["eventId"].text, "e")
        XCTAssertTrue(target["requiresAdminMode"].bool)
    }
    func testCanonicalTaskPreservesPersonalAttendanceAndCannotDowngradeAdminTarget() {
        let attendance: JSON = .object(["screen": .str("attendance"), "eventId": .str("e"), "requiresAdminMode": .bool(false)])
        XCTAssertEqual(UXNotificationTarget.resolve(.object(["target": attendance, "eventId": .str("other")])), .task(attendance))
        let staff: JSON = .object(["screen": .str("adminClaims"), "claimId": .str("c"), "requiresAdminMode": .bool(false)])
        guard case .task(let target) = UXNotificationTarget.resolve(staff) else { return XCTFail("Expected a canonical task") }
        XCTAssertTrue(target["requiresAdminMode"].bool)
        XCTAssertEqual(target["claimId"].text, "c")
    }

    func testPersonalEventPushKeepsMemberContextAcrossEveryReminderKind() {
        for kind in ["eventBroadcast", "reminder3d", "reminder1d", "reminderToday", "thankYou", "fomo"] {
            guard case .task(let target) = UXNotificationTarget.resolve(.object(["kind": .str(kind), "screen": .str("event"), "eventId": .str("e")])) else { return XCTFail("Missing event task") }
            XCTAssertEqual(target["screen"].text, "event"); XCTAssertFalse(target["requiresAdminMode"].bool)
        }
    }
    func testProofDecisionKeepsExactProofInPersonalEventContext() {
        let payload: JSON = .object(["kind": .str("posterProofDecided"), "eventId": .str("e"), "proofId": .str("p")])
        guard case .task(let target) = UXNotificationTarget.resolve(payload) else { return XCTFail("Missing proof task") }
        XCTAssertEqual(target["screen"].text, "event"); XCTAssertEqual(target["proofId"].text, "p")
        XCTAssertEqual(target["eventId"].text, "e"); XCTAssertFalse(target["requiresAdminMode"].bool)
        let staff: JSON = .object(["screen": .str("adminPosterProofs"), "proofId": .str("p"), "requiresAdminMode": .bool(false)])
        guard case .task(let queue) = UXNotificationTarget.resolve(staff) else { return XCTFail("Missing staff proof task") }
        XCTAssertTrue(queue["requiresAdminMode"].bool); XCTAssertEqual(queue["proofId"].text, "p")
    }

}
