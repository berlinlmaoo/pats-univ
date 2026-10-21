import SwiftUI

struct EventCreateLink: View {
    @EnvironmentObject private var store: AppStore
    var body: some View {
        if store.can("city.operations") && !store.can("hq.manage") {
            NavigationRow(title: "app.adminNewEvent", icon: "plus.circle") { EventEditor() }
        } else if store.can("hq.manage") { Link(L.t("native.hqWeb"), destination: Config.baseURL.appendingPathComponent("events")) }
    }
}
struct AdminEventWorkspace: View {
    let workspace: JSON
    private var event: JSON { workspace["event"] }
    let reload: () async -> Void
    @State private var section = "overview"
    @EnvironmentObject private var store: AppStore
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.padding) {
            ScrollView(.horizontal) {
                HStack {
                    ForEach(["overview", "attendance", "reservations", "claims", "rewards", "draw", "report", "posterProofs", "recap"].filter { $0 != "posterProofs" || store.can("promoter.manage") }, id: \.self) { item in
                        Button(L.t(item == "posterProofs" ? "ux.posterProof.queueTitle" : "ux.workspace." + item)) { section = item }.buttonStyle(PATSButtonStyle(variant: section == item ? .maroon : .secondary)).fixedSize()
                    }
                }
            }.scrollIndicators(.hidden)
            switch section {
            case "attendance":
                Panel {
                    if workspace["lifecycle"]["canScan"].bool { NavigationRow(title: "app.adminScan", icon: "qrcode.viewfinder") { ScanView(eventID: event.id) } }
                    else { Notice(text: L.t(EventJourneyPolicy.ended(event) ? "ux.scan.ended" : "ux.scan.notOpen")) }
                    NavigationRow(title: "events.attendance", icon: "person.2") { AttendanceView(eventID: event.id) }
                }
            case "reservations": NavigationRow(title: "ux.workspace.reservations", icon: "square.grid.3x3") { SocialOperationsView(eventID: event.id) }
            case "claims": NavigationRow(title: "phase5.claimReview", icon: "doc.text") { ClaimsReviewView(initialEventID: event.id) }
            case "rewards": NavigationRow(title: "app.tabRewards", icon: "gift") { RewardValidationView(initialEventID: event.id) }
            case "draw": DrawView(eventID: event.id, ended: EventJourneyPolicy.ended(event))
            case "recap": NavigationRow(title: "ux.workspace.recap", icon: "chart.bar.doc.horizontal") { EventRecapView(eventID: event.id) }
            case "report": NavigationRow(title: "ux.report.title", subtitle: L.t(workspace["report"]["report"].exists ? "ux.report.reported" : "ux.report.notFilled"), icon: "doc.text") { EventReportView(eventID: event.id) }
            case "posterProofs":
                Panel {
                    ForEach(["PENDING", "APPROVED", "REJECTED"], id: \.self) { status in
                        HStack { Badge(value: status); Spacer(); CountChip(count: workspace["posterProofs"]["byStatus"][status].int) }
                    }
                    NavigationRow(title: "ux.posterProof.queueTitle", icon: "photo.badge.checkmark") { PosterProofReviewView(eventID: event.id) }
                }
            default:
                EventPosterHighlight(event: event)
                EventTiming(event: event)
                AdminEventActions(event: event, lifecycle: workspace["lifecycle"], reload: reload)
                Panel {
                    Text(L.t("ux.recap.sold")).font(Theme.title(17))
                    DetailRow(key: "ux.recap.soldTable", value: L.count(workspace["reservations"]["sold"]["table"].int))
                    DetailRow(key: "ux.recap.soldSofa", value: L.count(workspace["reservations"]["sold"]["sofa"].int))
                    DetailRow(key: "ux.recap.fdcSold", value: EventReportFDC.value(workspace["recap"]["fdcSold"]).map(L.count) ?? L.t("ux.report.notFilled"))
                    Text(L.t("ux.report.fdcHint")).font(Theme.body(13)).foregroundStyle(Theme.muted)
                    NavigationRow(title: "ux.report.title", icon: "doc.text") { EventReportView(eventID: event.id) }
                }
                EventContentPanel(event: event, content: workspace["content"])
            }
        }
    }
}
struct AdminEventActions: View {
    let event: JSON
    let lifecycle: JSON
    let reload: () async -> Void
    @EnvironmentObject private var store: AppStore
    @StateObject private var mutation = Mutation()
    var body: some View {
        Panel {
            DetailRow(key: "ux.workspace.publication", value: L.t(event["status"].text == "DRAFT" ? "ux.workspace.draft" : "ux.workspace.published"))
            Text(L.t("app.adminCheckedInCount", ["count": L.count(event["checkInCount"].int)])).font(Theme.title(20))
            if lifecycle["scanUnavailable"].text == "checkInEnded" {
                Notice(text: L.t("ux.workspace.checkInEnded", ["time": L.date(lifecycle["checkInClosesAt"].text, zone: event["timing"]["timezone"].text)]))
                NavigationRow(title: "ux.report.title", icon: "doc.text") { EventReportView(eventID: event.id) }
                NavigationRow(title: "ux.workspace.recap", icon: "chart.bar") { EventRecapView(eventID: event.id) }
            } else if lifecycle["canPublish"].bool {
                Notice(text: L.t("ux.editor.publishHint"))
                lifecycleAction("events.actionPublish", action: "publish", message: L.t("ux.events.publishConfirm"))
            } else {
                if lifecycle["canScan"].bool { NavigationRow(title: "app.adminScan", icon: "qrcode.viewfinder") { ScanView(eventID: event.id) } }
                if lifecycle["canClose"].bool { lifecycleAction("events.actionClose", action: "close", message: L.t("events.closeBody")) }
                if lifecycle["canOpen"].bool {
                    let early = lifecycle["openEarly"].bool
                    Text(L.t(early ? "ux.workspace.openEarlyBody" : "ux.events.openHint", ["time": L.date(lifecycle[early ? "checkInOpensAt" : "checkInClosesAt"].text, zone: event["timing"]["timezone"].text)])).font(Theme.body(14))
                    lifecycleAction(early ? "ux.events.openEarly" : "events.actionOpen", action: "open", message: L.t(early ? "ux.workspace.openEarlyBody" : "ux.events.openHint", ["time": L.date(lifecycle[early ? "checkInOpensAt" : "checkInClosesAt"].text, zone: event["timing"]["timezone"].text)]))
                }
            }
            NavigationRow(title: "events.attendance", icon: "person.2") { AttendanceView(eventID: event.id) }
            if !store.can("hq.manage") { NavigationRow(title: "common.edit", icon: "pencil") { EventEditor(eventID: event.id) } }
            if store.can("hq.manage") { Link(L.t("ux.workspace.dashboard"), destination: Config.baseURL.appendingPathComponent("events").appendingPathComponent(event.id)) }
            MutationState(mutation: mutation)
        }
    }
    private func lifecycleAction(_ label: String, action: String, message: String) -> some View {
        ConfirmAction(label: label, message: event["title"].text + " · " + event["city"]["name"].text + "\n" + message, disabled: mutation.busy || !store.managing) {
            await mutation.send("/api/admin/events/\(event.id)/actions", body: .object(["action": .str(action)]), after: reload)
        }
    }
}
struct AttendanceView: View {
    let eventID: String
    @EnvironmentObject private var store: AppStore
    @StateObject private var context = Resource()
    var body: some View {
        DataPage(title: "app.adminLive", path: "/api/admin/events/\(eventID)/attendance", room: Room(kind: "attendance", id: eventID), eventContext: context.data["event"]) { data, _ in
            if !store.managing { Notice(text: L.t("ux.workspace.enableAdmin")) }
            else {
            Text(L.t("app.attendanceCount", ["count": L.count(data["count"].int)])).font(Theme.title())
            HStack { ForEach(["NFC", "APP_QR", "MANUAL"], id: \.self) { method in VStack { Badge(value: method); Text(L.count(data["byMethod"][method].int)) } } }
            if data["entries"].rows.isEmpty { EmptyState(title: "events.attendanceEmptyTitle", message: "events.attendanceEmptyBody", icon: "person.2") }
            ForEach(data["entries"].rows) { e in
                Panel {
                    Text(e["member"]["fullName"].text).font(Theme.title(17)); Text(e["member"]["nim"].text).monospacedDigit()
                    Text(L.date(e["checkedInAt"].text)); Badge(value: e["method"].text)
                    Text(e["admin"]["name"].text).foregroundStyle(Theme.muted)
                    if !e["manualReason"].text.isEmpty { Text(e["manualReason"].text) }
                }
            }
            }
        }.task { await context.load("/api/admin/events/\(eventID)") }
    }
}
struct EventEditor: View {
    var eventID = ""
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @StateObject private var meta = Resource()
    @StateObject private var mutation = Mutation()
    @State private var title = ""
    @State private var description = ""
    @State private var originalDescription = ""
    @State private var savedEventID = ""
    @State private var venue = ""
    @State private var date = Date()
    @State private var start = Date()
    @State private var end = Date().addingTimeInterval(3600)
    @State private var capacity = ""
    @State private var before = "60"
    @State private var publish = true
    private var zone: TimeZone { TimeZone(identifier: meta.data["city"]["timezone"].text) ?? TimeZone(identifier: "Asia/Jakarta")! }
    // The current event-form response omits the promised default; capabilities still identify regional approval mode.
    private var descriptionNeedsApproval: Bool { meta.data["defaults"]["descriptionNeedsApproval"].bool || (store.can("city.operations") && !store.can("hq.manage")) }
    var body: some View {
        Page(title: eventID.isEmpty ? "events.addTitle" : "events.editTitle") {
            ResourceState(resource: meta) { await load() }
            if !store.managing { Notice(text: L.t("ux.workspace.enableAdmin")) }
            else if meta.data.exists {
                Text(meta.data["city"]["name"].text + " · " + zone.identifier).foregroundStyle(Theme.muted)
                Field(key: "events.eventTitle", value: $title)
                DateTimeField(key: "events.date", value: $date, time: false, zone: zone)
                DateTimeField(key: "events.startTime", value: $start, time: true, zone: zone)
                DateTimeField(key: "events.endTime", value: $end, time: true, zone: zone)
                Text(L.t("events.endHint")).font(Theme.body(13)).foregroundStyle(Theme.muted)
                Choice(label: "events.venue", options: meta.data["venues"].rows, selection: $venue, allowEmpty: true)
                Field(key: "events.description", value: $description)
                if descriptionNeedsApproval { Notice(text: L.t("ux.content.approvalHint")) }
                if !eventID.isEmpty { Link(L.t("ux.content.title"), destination: Config.baseURL.appendingPathComponent("events").appendingPathComponent(eventID)) }
                Field(key: "events.capacity", value: $capacity, keyboard: .numberPad)
                Field(key: "ux.editor.opensMinutes", value: $before, keyboard: .numberPad)
                Panel {
                    DetailRow(key: "ux.events.opens", value: L.date(eventStart.addingTimeInterval(-Double(Int(before) ?? 0) * 60).ISO8601Format(), zone: zone.identifier))
                    DetailRow(key: "ux.events.closes", value: L.date(eventEnd.ISO8601Format(), zone: zone.identifier))
                    Text(zone.identifier).font(Theme.body(13)).foregroundStyle(Theme.muted)
                }
                Toggle(L.t("events.publish"), isOn: $publish)
                Text(L.t("ux.editor.publishHint")).font(Theme.body(13)).foregroundStyle(Theme.muted)
                MutationState(mutation: mutation)
                Button(L.t(eventID.isEmpty ? "events.create" : "common.save")) { Task { await save() } }.buttonStyle(PATSButtonStyle(loading: mutation.busy)).disabled(mutation.busy || !valid || !savedEventID.isEmpty)
                if !savedEventID.isEmpty { NavigationRow(title: "events.details", icon: "calendar") { EventDetailView(eventID: savedEventID, admin: true) } }
            }
        }.task { await load() }
    }
    private var eventStart: Date { combined(start) }
    private var eventEnd: Date {
        let value = combined(end)
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = zone
        return value <= eventStart ? calendar.date(byAdding: .day, value: 1, to: value) ?? value : value
    }
    private func combined(_ time: Date) -> Date {
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = zone
        let day = calendar.dateComponents([.year, .month, .day], from: date)
        let clock = calendar.dateComponents([.hour, .minute], from: time)
        return calendar.date(from: DateComponents(timeZone: zone, year: day.year, month: day.month, day: day.day, hour: clock.hour, minute: clock.minute)) ?? date
    }
    private var valid: Bool { !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && title.count >= 2 && title.count <= 120 && description.count <= 2000 && (Int(before).map { (0...720).contains($0) } ?? false) && (capacity.isEmpty || (Int(capacity).map { (1...100_000).contains($0) } ?? false)) }
    private func format(_ value: Date, _ pattern: String) -> String { let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = zone; f.dateFormat = pattern; return f.string(from: value) }
    private func load() async {
        await meta.load("/api/admin/event-form")
        before = meta.data["opensBeforeMinutes"].exists ? meta.data["opensBeforeMinutes"].text : "60"
        guard !eventID.isEmpty else { return }
        await mutation.run {
            let response = try await APIClient.shared.call("GET", "/api/admin/events/\(eventID)")
            let v = response["form"]; title = v["title"].text; description = v["description"].text; originalDescription = v["description"].text; venue = v["venueId"].text
            before = v["opensBeforeMinutes"].text; capacity = v["capacity"].text; publish = v["publish"].bool
            let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = zone; f.dateFormat = "yyyy-MM-dd HH:mm"
            date = f.date(from: v["date"].text + " 12:00") ?? Date()
            start = f.date(from: v["date"].text + " " + v["startTime"].text) ?? Date()
            end = f.date(from: v["date"].text + " " + v["endTime"].text) ?? Date()
        }
    }
    private func save() async {
        guard store.managing && store.can("city.operations") else { return }
        await mutation.run {
            let body: JSON = .object(["title": .str(title), "description": .str(description), "venueId": .str(venue), "date": .str(format(date, "yyyy-MM-dd")), "startTime": .str(format(start, "HH:mm")), "endTime": .str(format(end, "HH:mm")), "capacity": capacity.isEmpty ? .null : .num(Int(capacity) ?? 0), "opensBeforeMinutes": .num(Int(before) ?? 60), "publish": .bool(publish)])
            let result = try await APIClient.shared.call(eventID.isEmpty ? "POST" : "PATCH", "/api/admin/events" + (eventID.isEmpty ? "" : "/\(eventID)"), body)
            if descriptionNeedsApproval && description.trimmingCharacters(in: .whitespacesAndNewlines) != originalDescription.trimmingCharacters(in: .whitespacesAndNewlines) {
                mutation.message = L.t("ux.content.submitted"); savedEventID = result["event"].id
            } else { dismiss() }
        }
    }
}

struct EventContentPanel: View {
    let event: JSON
    let content: JSON
    var body: some View {
        Panel {
            Text(L.t("ux.content.title")).font(Theme.title(20))
            Text(L.t(content["mode"].text == "approval" ? "ux.content.approvalHint" : "ux.content.directHint")).font(Theme.body(14)).foregroundStyle(Theme.muted)
            if content["pending"].exists {
                Text(L.t("ux.content.pending")).fontWeight(.semibold)
                Text(L.t("ux.content.by", ["name": content["pending"]["submittedBy"].text, "date": L.date(content["pending"]["submittedAt"].text)] )).font(Theme.body(13))
                if content["pending"]["description"].exists { Text(content["pending"]["description"].text).font(Theme.body(14)) }
                Text(L.t("ux.content.replacesPending")).font(Theme.body(13)).foregroundStyle(Theme.muted)
            }
            Link(L.t("ux.workspace.manageInDashboard"), destination: Config.baseURL.appendingPathComponent("events").appendingPathComponent(event.id))
        }
    }
}
