import Foundation

enum EventReportField: String, CaseIterable {
    case tablesSold, sofasSold, fdcSold, paxTotal, membersAttended, nonMembersAttended, newMembers

    var referenceKey: String? {
        switch self {
        case .tablesSold, .sofasSold, .membersAttended, .newMembers: return rawValue
        case .paxTotal: return "reservationPax"
        case .fdcSold, .nonMembersAttended: return nil
        }
    }
}

/// A draft is separate from system references and only accepts responses for its own event.
struct EventReportDraft: Equatable {
    private(set) var eventID: String
    private(set) var loaded = false
    private(set) var values: [String: String] = [:]
    private var savedValues: [String: String] = [:]

    init(eventID: String) { self.eventID = eventID }

    var isDirty: Bool { values != savedValues }
    func text(_ field: EventReportField) -> String { values[field.rawValue] ?? "" }

    mutating func set(_ field: EventReportField, text: String) { values[field.rawValue] = text }

    mutating func reset(eventID: String) {
        guard eventID != self.eventID else { return }
        self = EventReportDraft(eventID: eventID)
    }

    /// Refreshing references or saved server data must not replace a local edit.
    mutating func receive(_ response: JSON) {
        guard response["eventId"].text == eventID else { return }
        guard !loaded || !isDirty else { return }
        apply(response["report"])
    }

    mutating func acceptSaved(_ response: JSON) {
        guard response["eventId"].text == eventID, response["report"].exists else { return }
        apply(response["report"])
    }

    static func number(_ text: String) -> Int? {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, value.utf8.allSatisfy({ (48...57).contains($0) }),
              let number = Int(value), (0...1_000_000).contains(number) else { return nil }
        return number
    }

    var payload: JSON? {
        guard loaded, !eventID.isEmpty else { return nil }
        var result: [String: JSON] = [:]
        for field in EventReportField.allCases {
            guard let number = Self.number(text(field)) else { return nil }
            result[field.rawValue] = .num(number)
        }
        return .object(result)
    }

    private mutating func apply(_ report: JSON) {
        values = Dictionary(uniqueKeysWithValues: EventReportField.allCases.map { field in
            (field.rawValue, report[field.rawValue].exists ? report[field.rawValue].text : "")
        })
        savedValues = values
        loaded = true
    }
}

enum EventReportFDC {
    /// Zero is a reported value; a missing report is not a zero sale.
    static func value(_ fdc: JSON) -> Int? {
        guard fdc["status"].text == "reported", fdc["value"].exists else { return nil }
        return EventReportDraft.number(fdc["value"].text)
    }
}

enum EventReportListPolicy {
    static func timezone(_ event: JSON, knownCities: [String: String]) -> String? {
        for candidate in [event["city"]["timezone"].text, event["timing"]["timezone"].text, knownCities[event["city"].id] ?? ""] {
            if !candidate.isEmpty && TimeZone(identifier: candidate) != nil { return candidate }
        }
        return nil
    }

    /// Matches admin Home: an event ended in the last 30 days and has no EventReport.
    static func isDue(_ row: JSON, at now: Date = Date()) -> Bool {
        guard !row["report"].exists, let end = Dates.parse(row["event"]["endsAt"].text) else { return false }
        return end < now && end >= now.addingTimeInterval(-30 * 24 * 3600)
    }
}
