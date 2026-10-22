import SwiftUI

struct EventReportView: View {
    let eventID: String
    var body: some View {
        AdminModeRequired(capability: "city.operations") { EventReportScreen(eventID: eventID) }
    }
}

struct EventReportListView: View {
    var onlyDue = false
    var body: some View {
        AdminModeRequired(capability: "city.operations") { EventReportListScreen(onlyDue: onlyDue) }
    }
}

private struct EventReportListItem: Identifiable {
    let row: JSON
    var id: String { row["event"].id }
}

private struct EventReportListScreen: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.scenePhase) private var phase
    @StateObject private var state = Resource()
    @State private var cityID = ""
    @State private var search = ""
    @State private var status: String
    @State private var now = Date()
    @State private var cityTimezones: [String: String] = [:]
    @State private var timezonesLoading = false

    init(onlyDue: Bool) { _status = State(initialValue: onlyDue ? "due" : "all") }

    var body: some View {
        let items = filtered(state.data["events"].rows).map { EventReportListItem(row: $0) }
        let cities = availableCities(state.data["events"].rows)
        Page(title: "ux.report.dashboardTitle") {
            Text(store.scope).font(Theme.body(14)).foregroundStyle(Theme.muted)
            Panel {
                Field(key: "native.search", value: $search)
                if store.can("hq.manage") {
                    Picker(L.t("ux.report.colCity"), selection: $cityID) {
                        Text(L.t("ux.report.allCities")).tag("")
                        ForEach(cities) { city in Text(city["name"].text).tag(city.id) }
                    }.pickerStyle(.menu)
                }
                Picker(L.t("ux.report.listStatus"), selection: $status) {
                    Text(L.t("ux.report.listAll")).tag("all")
                    Text(L.t("ux.report.listDue")).tag("due")
                    Text(L.t("ux.report.listMissing")).tag("missing")
                    Text(L.t("ux.report.reported")).tag("reported")
                }.pickerStyle(.menu)
            }
            ResourceState(resource: state) { await load() }
            if !timezonesLoading && state.data["events"].rows.contains(where: { EventReportListPolicy.timezone($0["event"], knownCities: cityTimezones) == nil }) {
                Notice(text: L.t("ux.report.timezoneUnavailable"))
                Button(L.t("common.retry")) { Task { await loadTimezones() } }.buttonStyle(PATSButtonStyle(variant: .secondary))
            }
            if state.data.exists {
                Text(L.t("ux.report.listCount", ["count": L.count(items.count)])).font(Theme.body(13)).foregroundStyle(Theme.muted)
                if items.isEmpty { EmptyState(title: "ux.report.listEmpty", message: "ux.report.listEmptyBody", icon: "doc.text") }
                ForEach(items) { item in
                    let event = item.row["event"]
                    let report = item.row["report"]
                    let zone = EventReportListPolicy.timezone(event, knownCities: cityTimezones)
                    Panel {
                        NavigationRow(title: event["title"].text, subtitle: [event["city"]["name"].text, zone.map { L.date(event["startsAt"].text, zone: $0) } ?? ""].filter { !$0.isEmpty }.joined(separator: " · "), icon: "doc.text") { EventReportView(eventID: event.id) }
                        Badge(value: report.exists ? "ux.report.reported" : EventReportListPolicy.isDue(item.row, at: now) ? "ux.report.due" : "ux.report.notFilled")
                        if report.exists, let zone {
                            Text(L.t("ux.report.lastEdit", ["name": report["updatedBy"].text, "date": L.date(report["updatedAt"].text, zone: zone)])).font(Theme.body(13)).foregroundStyle(Theme.muted)
                        }
                    }
                }
            }
            Panel {
                NavigationRow(title: "ux.report.openDashboard", subtitle: L.t("ux.report.dashboardBody"), icon: "chart.bar") {
                    DashboardTaskView(path: "/reports", title: "ux.report.dashboardTitle", message: "ux.report.dashboardBody")
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .onChange(of: phase) { _, value in if value == .active { Task { await load() } } }
    }

    private func load() async {
        await state.load("/api/admin/event-reports")
        now = Date()
        if state.error == nil { await loadTimezones() }
    }
    private func loadTimezones() async {
        guard !timezonesLoading else { return }
        var seen = Set<String>()
        let seeds = state.data["events"].rows.compactMap { row -> (String, String)? in
            let event = row["event"]
            let city = event["city"].id
            guard EventReportListPolicy.timezone(event, knownCities: [:]) == nil,
                  !city.isEmpty, !event.id.isEmpty, seen.insert(city).inserted else { return nil }
            return (city, event.id)
        }
        guard !seeds.isEmpty else { return }
        timezonesLoading = true
        defer { timezonesLoading = false }
        await withTaskGroup(of: (String, String?).self) { group in
            for (city, event) in seeds {
                group.addTask {
                    let response = try? await APIClient.shared.call("GET", "/api/admin/events/\(event)")
                    return (city, response.flatMap { EventReportListPolicy.timezone($0["event"], knownCities: [:]) })
                }
            }
            for await (city, timezone) in group {
                if !Task.isCancelled, let timezone { cityTimezones[city] = timezone }
            }
        }
    }
    private func filtered(_ rows: [JSON]) -> [JSON] {
        rows.filter { row in
            let event = row["event"]
            let matchesCity = cityID.isEmpty || event["city"].id == cityID
            let matchesSearch = search.isEmpty || (event["title"].text + " " + event["city"]["name"].text).localizedCaseInsensitiveContains(search)
            let matchesStatus: Bool
            switch status {
            case "due": matchesStatus = EventReportListPolicy.isDue(row, at: now)
            case "missing": matchesStatus = !row["report"].exists
            case "reported": matchesStatus = row["report"].exists
            default: matchesStatus = true
            }
            return matchesCity && matchesSearch && matchesStatus
        }
    }
    private func availableCities(_ rows: [JSON]) -> [JSON] {
        var seen = Set<String>()
        return rows.compactMap { row in
            let city = row["event"]["city"]
            return !city.id.isEmpty && seen.insert(city.id).inserted ? city : nil
        }.sorted { $0["name"].text.localizedStandardCompare($1["name"].text) == .orderedAscending }
    }
}

private struct EventReportScreen: View {
    let eventID: String
    @EnvironmentObject private var store: AppStore
    @Environment(\.scenePhase) private var phase
    @StateObject private var state = Resource()
    @StateObject private var context = Resource()
    @StateObject private var mutation = Mutation()
    @State private var draft: EventReportDraft

    init(eventID: String) {
        self.eventID = eventID
        _draft = State(initialValue: EventReportDraft(eventID: eventID))
    }

    var body: some View {
        let current = draft
        let response = state.data
        let editable = canEdit
        let event = context.data["event"].id == eventID ? context.data["event"] : JSON.null
        Page(title: "ux.report.title", eventContext: event) {
            ResourceState(resource: state) { await loadReport() }
            ResourceState(resource: context) { await loadContext() }
            if response["eventId"].text == eventID && current.loaded {
                Notice(text: L.t("ux.report.body"))
                Panel {
                    if response["report"].exists {
                        Text(L.t("ux.report.lastEdit", ["name": response["report"]["updatedBy"].text, "date": L.date(response["report"]["updatedAt"].text, zone: timezone)])).font(Theme.body(13)).foregroundStyle(Theme.muted)
                    } else { Text(L.t("ux.report.notFilled")).fontWeight(.semibold) }
                    if current.isDirty { Notice(text: L.t("ux.report.draftRetained")) }
                    if !response["canEdit"].bool { Notice(text: L.t("ux.report.readOnly")) }
                    ForEach(EventReportField.allCases, id: \.rawValue) { field in
                        VStack(alignment: .leading, spacing: 5) {
                            Field(key: "ux.report." + field.rawValue, value: binding(field), keyboard: .numberPad).disabled(!editable || mutation.busy)
                            if field == .fdcSold { Text(L.t("ux.report.fdcHint")).font(Theme.body(13)).foregroundStyle(Theme.muted) }
                            if let referenceKey = field.referenceKey, response["reference"][referenceKey].exists {
                                Text(L.t(field == .paxTotal ? "ux.report.reservationPaxReference" : "ux.report.reference", ["value": L.count(response["reference"][referenceKey].int)])).font(Theme.body(13)).foregroundStyle(Theme.muted)
                            }
                            if !current.text(field).isEmpty && EventReportDraft.number(current.text(field)) == nil {
                                Text(L.t("ux.report.numberRange")).font(Theme.body(13)).foregroundStyle(Theme.danger)
                            }
                        }
                    }
                    Text(L.t("ux.report.requiredFields")).font(Theme.body(13)).foregroundStyle(Theme.muted)
                    MutationState(mutation: mutation)
                    if response["canEdit"].bool {
                        Button(L.t("ux.report.save")) { Task { await save() } }
                            .buttonStyle(PATSButtonStyle(loading: mutation.busy))
                            .disabled(!editable || mutation.busy || state.loading || current.payload == nil || (response["report"].exists && !current.isDirty))
                    }
                }
                EventReportHistory(history: response["history"].rows, timezone: timezone)
            }
        }
        .task(id: eventID) {
            if draft.eventID != eventID { draft.reset(eventID: eventID); state.data = .null; context.data = .null }
            await load()
        }
        .refreshable { await load() }
        .onChange(of: phase) { _, value in if value == .active { Task { await load() } } }
        .navigationBarBackButtonHidden(mutation.busy)
        .interactiveDismissDisabled(mutation.busy)
    }

    private var timezone: String {
        let event = context.data["event"]
        return event["timing"]["timezone"].text.isEmpty ? (event["city"]["timezone"].text.isEmpty ? "Asia/Jakarta" : event["city"]["timezone"].text) : event["timing"]["timezone"].text
    }
    private var canEdit: Bool {
        store.managing && store.can("city.operations") && state.error == nil && context.error == nil && context.data["event"].id == eventID && state.data["eventId"].text == eventID && state.data["canEdit"].bool && draft.loaded
    }
    private func binding(_ field: EventReportField) -> Binding<String> {
        Binding(get: { draft.text(field) }, set: { draft.set(field, text: $0) })
    }
    private func load() async {
        async let report: Void = loadReport()
        async let event: Void = loadContext()
        _ = await (report, event)
    }
    private func loadContext() async { await context.load("/api/admin/events/\(eventID)") }
    private func loadReport() async {
        guard !mutation.busy else { return }
        await state.load("/api/admin/events/\(eventID)/report")
        guard !Task.isCancelled, state.error == nil else { return }
        draft.receive(state.data)
    }
    private func save() async {
        guard canEdit, !state.loading, !store.operationInProgress, let body = draft.payload else { return }
        let requestedEvent = eventID
        store.operationInProgress = true
        defer { store.operationInProgress = false }
        await mutation.run {
            let response = try await APIClient.shared.call("PUT", "/api/admin/events/\(requestedEvent)/report", body)
            guard draft.eventID == requestedEvent, response["eventId"].text == requestedEvent else { return }
            draft.acceptSaved(response); state.data = response
            mutation.message = L.t("ux.report.saved")
        }
    }
}

private struct EventReportHistory: View {
    let history: [JSON]
    let timezone: String
    var body: some View {
        Panel {
            Text(L.t("ux.report.history")).font(Theme.title(20))
            if history.isEmpty { Text(L.t("ux.report.historyEmpty")).font(Theme.body(13)).foregroundStyle(Theme.muted) }
            ForEach(Array(history.enumerated()), id: \.offset) { _, entry in
                VStack(alignment: .leading, spacing: 5) {
                    Text([entry["by"].text.isEmpty ? L.t("common.notSet") : entry["by"].text, L.date(entry["at"].text, zone: timezone)].joined(separator: " · ")).fontWeight(.semibold)
                    let changed = EventReportField.allCases.filter { entry["changes"][$0.rawValue].exists }
                    if changed.isEmpty { Text(L.t("ux.report.noChanges")).font(Theme.body(13)).foregroundStyle(Theme.muted) }
                    ForEach(changed, id: \.rawValue) { field in
                        let change = entry["changes"][field.rawValue]
                        Text(L.t("ux.report." + field.rawValue) + ": " + (change["from"].exists ? L.count(change["from"].int) : "—") + " → " + L.count(change["to"].int)).font(Theme.body(13))
                    }
                }.padding(.vertical, 6)
            }
        }
    }
}
