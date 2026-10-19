import XCTest
@testable import PATSCore

final class SendKeyTests: XCTestCase {
    func testRetryReusesKeyAndEditMakesNewOne() {
        var key = DraftSendKey()
        key.update(text: "Halo", attachment: "")
        let first = key.value
        XCTAssertNotNil(first.range(of: "^[A-Za-z0-9_-]{8,64}$", options: .regularExpression))
        // A retry of the unchanged draft (no update, or an update with the same content) keeps the key.
        key.update(text: "Halo", attachment: "")
        XCTAssertEqual(key.value, first)
        // Editing the text starts a new draft.
        key.update(text: "Halo!", attachment: "")
        XCTAssertNotEqual(key.value, first)
        let edited = key.value
        // Adding or removing an attachment also starts a new draft.
        key.update(text: "Halo!", attachment: "social/abc.jpg")
        XCTAssertNotEqual(key.value, edited)
        // A successful send resets the key even if the next draft has the same text.
        let sent = key.value
        key.reset()
        XCTAssertNotEqual(key.value, sent)
    }
}
