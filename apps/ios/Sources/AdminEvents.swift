import SwiftUI

struct EventCreateLink: View {
    @EnvironmentObject private var store: AppStore
    var body: some View {
        if store.can("city.operations") && !store.can("hq.manage") {
            NavigationRow(title: "app.adminNewEvent", icon: "plus.circle") { EventEditor() }
        } else if store.can("hq.manage") { Link(L.t("native.hqWeb"), destination: Config.baseURL.appendingPathComponent("events")) }
    }
}
struct AdminEventActions: View {
    let event: JSON
    let reload: () async -> Void
    @EnvironmentObject private var store: AppStore
    @StateObject private var mutation = Mutation()
    var body: some View {
        Panel {
            Text(L.t("app.adminCheckedInCount", ["count": L.count(event["checkInCount"].int)])).font(Theme.title(20))
            NavigationRow(title: "app.adminScan", icon: "qrcode.viewfinder") { ScanView(eventID: event.id) }
            NavigationRow(title: "events.attendance", icon: "person.2") { AttendanceView(eventID: event.id) }
            if !store.can("hq.manage") { NavigationRow(title: "common.edit", icon: "pencil") { EventEditor(eventID: event.id) } }
            ForEach(event["status"].text == "DRAFT" ? ["publish", "open"] : event["status"].text == "OPEN" ? ["close"] : ["open"], id: \.self) { action in
                ConfirmAction(label: action == "publish" ? "events.actionPublish" : action == "open" ? "events.actionOpen" : "events.actionClose", message: action == "close" ? L.t("events.closeBody") : L.t("events.openBody", ["time": L.date(event["checkInClosesAt"].text)]), disabled: mutation.busy) {
                    await mutation.send("/api/admin/events/\(event.id)/actions", body: .object(["action": .str(action)]), after: reload)
                }
            }
            MutationState(mutation: mutation)
        }
    }
}
struct AttendanceView: View {
    let eventID: String
    var body: some View {
        DataPage(title: "app.adminLive", path: "/api/admin/events/\(eventID)/attendance", room: Room(kind: "attendance", id: eventID)) { data, _ in
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
    }
}
struct EventEditor: View {
    var eventID = ""
    @Environment(\.dismiss) private var dismiss
    @StateObject private var meta = Resource()
    @StateObject private var mutation = Mutation()
    @State private var title = ""
    @State private var description = ""
    @State private var venue = ""
    @State private var date = Date()
    @State private var start = Date()
    @State private var end = Date().addingTimeInterval(3600)
    @State private var capacity = ""
    @State private var before = "60"
    @State private var publish = true
    private var zone: TimeZone { TimeZone(identifier: meta.data["city"]["timezone"].text) ?? TimeZone(identifier: "Asia/Jakarta")! }
    var body: some View {
        Page(title: eventID.isEmpty ? "events.addTitle" : "events.editTitle") {
            ResourceState(resource: meta) { await load() }
            if meta.data.exists {
                Text(meta.data["city"]["name"].text + " · " + zone.identifier).foregroundStyle(Theme.muted)
                Field(key: "events.eventTitle", value: $title)
                DatePicker(L.t("events.date"), selection: $date, displayedComponents: .date).environment(\.timeZone, zone)
                DatePicker(L.t("events.startTime"), selection: $start, displayedComponents: .hourAndMinute).environment(\.timeZone, zone)
                DatePicker(L.t("events.endTime"), selection: $end, displayedComponents: .hourAndMinute).environment(\.timeZone, zone)
                Text(L.t("events.endHint")).font(Theme.body(13)).foregroundStyle(Theme.muted)
                Choice(label: "events.venue", options: meta.data["venues"].rows, selection: $venue, allowEmpty: true)
                Field(key: "events.description", value: $description)
                Field(key: "events.capacity", value: $capacity, keyboard: .numberPad)
                Field(key: "events.opensBefore", value: $before, keyboard: .numberPad)
                Toggle(L.t("events.publish"), isOn: $publish)
                MutationState(mutation: mutation)
                Button(L.t(eventID.isEmpty ? "events.create" : "common.save")) { Task { await save() } }.buttonStyle(PATSButtonStyle()).disabled(mutation.busy || !valid)
            }
        }.task { await load() }
    }
    private var valid: Bool { !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && title.count >= 2 && title.count <= 120 && description.count <= 2000 && (Int(before).map { (0...720).contains($0) } ?? false) && (capacity.isEmpty || (Int(capacity).map { (1...100_000).contains($0) } ?? false)) }
    private func format(_ value: Date, _ pattern: String) -> String { let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = zone; f.dateFormat = pattern; return f.string(from: value) }
    private func load() async {
        await meta.load("/api/admin/event-form")
        before = meta.data["opensBeforeMinutes"].exists ? meta.data["opensBeforeMinutes"].text : "60"
        guard !eventID.isEmpty else { return }
        await mutation.run {
            let response = try await APIClient.shared.call("GET", "/api/admin/events/\(eventID)")
            let v = response["form"]; title = v["title"].text; description = v["description"].text; venue = v["venueId"].text
            before = v["opensBeforeMinutes"].text; capacity = v["capacity"].text; publish = v["publish"].bool
            let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = zone; f.dateFormat = "yyyy-MM-dd HH:mm"
            date = f.date(from: v["date"].text + " 12:00") ?? Date()
            start = f.date(from: v["date"].text + " " + v["startTime"].text) ?? Date()
            end = f.date(from: v["date"].text + " " + v["endTime"].text) ?? Date()
        }
    }
    private func save() async {
        await mutation.run {
            let body: JSON = .object(["title": .str(title), "description": .str(description), "venueId": .str(venue), "date": .str(format(date, "yyyy-MM-dd")), "startTime": .str(format(start, "HH:mm")), "endTime": .str(format(end, "HH:mm")), "capacity": capacity.isEmpty ? .null : .num(Int(capacity) ?? 0), "opensBeforeMinutes": .num(Int(before) ?? 60), "publish": .bool(publish)])
            _ = try await APIClient.shared.call(eventID.isEmpty ? "POST" : "PATCH", "/api/admin/events" + (eventID.isEmpty ? "" : "/\(eventID)"), body)
            dismiss()
        }
    }
}
