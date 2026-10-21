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
}
