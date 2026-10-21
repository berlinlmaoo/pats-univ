import XCTest
@testable import PATSCore

final class EventReportPolicyTests: XCTestCase {
    private func response(event: String = "event-a", report: JSON = .null, reference: JSON = .null) -> JSON {
        .object(["eventId": .str(event), "report": report, "reference": reference, "canEdit": .bool(true)])
    }
    private func report(_ number: Int) -> JSON {
        .object(Dictionary(uniqueKeysWithValues: EventReportField.allCases.map { ($0.rawValue, .num(number)) }))
    }

    func testMissingReportIsBlankEvenWhenSystemReferencesHaveCounts() {
        var draft = EventReportDraft(eventID: "event-a")
        draft.receive(response(reference: .object(["tablesSold": .num(12), "reservationPax": .num(90)])))
        XCTAssertTrue(draft.loaded)
        XCTAssertFalse(draft.isDirty)
        XCTAssertTrue(EventReportField.allCases.allSatisfy { draft.text($0).isEmpty })
        XCTAssertNil(draft.payload)
    }

    func testAllSevenFieldsAreRequiredAndZeroIsAValidExplicitAnswer() {
        var draft = EventReportDraft(eventID: "event-a")
        draft.receive(response())
        for field in EventReportField.allCases.dropLast() { draft.set(field, text: "0") }
        XCTAssertNil(draft.payload)
        draft.set(.newMembers, text: "0")
        XCTAssertEqual(draft.payload, report(0))
        XCTAssertEqual(draft.payload?.object.count, 7)
    }

    func testCountsRejectFractionsNegativeMissingAndOutOfRangeValues() {
        for text in ["", " ", "-1", "1.5", "1,000", "1e3", "+3", "1000001", "999999999999999999999999", "12abc"] {
            XCTAssertNil(EventReportDraft.number(text), text)
        }
        XCTAssertEqual(EventReportDraft.number("0"), 0)
        XCTAssertEqual(EventReportDraft.number("1000000"), 1_000_000)
        XCTAssertEqual(EventReportDraft.number(" 12\n"), 12)
    }

    func testRefreshUpdatesPristineReportButNeverOverwritesDraftOrCopiesReferences() {
        var draft = EventReportDraft(eventID: "event-a")
        draft.receive(response(report: report(3)))
        draft.receive(response(report: report(4), reference: report(100)))
        XCTAssertEqual(draft.text(.tablesSold), "4")
        draft.set(.tablesSold, text: "17")
        draft.set(.newMembers, text: "")
        draft.receive(response(report: report(8), reference: report(200)))
        XCTAssertEqual(draft.text(.tablesSold), "17")
        XCTAssertEqual(draft.text(.newMembers), "")
        XCTAssertEqual(draft.text(.membersAttended), "4")
        XCTAssertTrue(draft.isDirty)
        XCTAssertNil(draft.payload)
    }

    func testSuccessfulSaveEstablishesNewBaselineAndEventChangeRejectsStaleResponses() {
        var draft = EventReportDraft(eventID: "event-a")
        draft.receive(response(report: report(1)))
        draft.set(.fdcSold, text: "006")
        var saved = report(1); saved["fdcSold"] = .num(6)
        draft.acceptSaved(response(report: saved))
        XCTAssertEqual(draft.text(.fdcSold), "6")
        XCTAssertFalse(draft.isDirty)
        draft.set(.tablesSold, text: "9")
        draft.reset(eventID: "event-b")
        XCTAssertFalse(draft.loaded)
        XCTAssertEqual(draft.text(.tablesSold), "")
        draft.receive(response(report: report(7)))
        draft.acceptSaved(response(report: report(7)))
        XCTAssertFalse(draft.loaded)
        draft.receive(response(event: "event-b", report: report(2)))
        XCTAssertEqual(draft.text(.tablesSold), "2")
    }

    func testResetToSameEventKeepsUnsavedTextAndFdcDistinguishesMissingFromZero() {
        var draft = EventReportDraft(eventID: "event-a")
        draft.receive(response())
        draft.set(.paxTotal, text: "123")
        draft.reset(eventID: "event-a")
        XCTAssertEqual(draft.text(.paxTotal), "123")
        XCTAssertTrue(draft.isDirty)
        XCTAssertNil(EventReportFDC.value(.object(["value": .null, "status": .str("notReported")])))
        XCTAssertEqual(EventReportFDC.value(.object(["value": .num(0), "status": .str("reported")])), 0)
        XCTAssertEqual(EventReportFDC.value(.object(["value": .num(12), "status": .str("reported")])), 12)
    }

    func testDueListIncludesMissingRecentEndedEventsWithoutConflatingReportedZeroOrUpcoming() {
        let now = Dates.parse("2026-10-22T12:00:00Z")!
        func row(_ end: Date, report: JSON = .null) -> JSON {
            .object(["event": .object(["endsAt": .str(end.ISO8601Format())]), "report": report])
        }
        XCTAssertTrue(EventReportListPolicy.isDue(row(now.addingTimeInterval(-60)), at: now))
        XCTAssertTrue(EventReportListPolicy.isDue(row(now.addingTimeInterval(-30 * 24 * 3600)), at: now))
        XCTAssertFalse(EventReportListPolicy.isDue(row(now.addingTimeInterval(-30 * 24 * 3600 - 1)), at: now))
        XCTAssertFalse(EventReportListPolicy.isDue(row(now.addingTimeInterval(60)), at: now))
        XCTAssertFalse(EventReportListPolicy.isDue(row(now), at: now))
        XCTAssertFalse(EventReportListPolicy.isDue(row(now.addingTimeInterval(-60), report: report(0)), at: now))
        XCTAssertFalse(EventReportListPolicy.isDue(.object(["report": .null]), at: now))
    }

    func testListDatesUseAuthoritativeTimezoneAndNeverInventJakartaForUnknownCities() {
        var event: JSON = .object(["city": .object(["id": .str("makassar")])])
        XCTAssertNil(EventReportListPolicy.timezone(event, knownCities: [:]))
        XCTAssertEqual(EventReportListPolicy.timezone(event, knownCities: ["makassar": "Asia/Makassar"]), "Asia/Makassar")
        event["city"]["timezone"] = .str("Asia/Jayapura")
        XCTAssertEqual(EventReportListPolicy.timezone(event, knownCities: ["makassar": "Asia/Makassar"]), "Asia/Jayapura")
        event["city"]["timezone"] = .str("unknown")
        XCTAssertNil(EventReportListPolicy.timezone(event, knownCities: ["makassar": "unknown"]))
    }
}
