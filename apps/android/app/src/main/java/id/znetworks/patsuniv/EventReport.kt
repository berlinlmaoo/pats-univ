package id.znetworks.patsuniv

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import java.time.LocalDate
import java.time.Instant
import java.time.ZoneId
import java.time.temporal.ChronoUnit

val eventReportFields = listOf("tablesSold", "sofasSold", "fdcSold", "paxTotal", "membersAttended", "nonMembersAttended", "newMembers")

fun validReportNumber(value: String): Boolean = Regex("^[0-9]+$").matches(value) && value.toIntOrNull()?.let { it in 0..1_000_000 } == true
fun eventReportErrors(values: Map<String, String>): Map<String, String> =
    eventReportFields.filter { !validReportNumber(values[it].orEmpty()) }.associateWith { "validation.numberInvalid" }
fun eventReportPayload(values: Map<String, String>): JsonObject {
    require(eventReportErrors(values).isEmpty())
    return JsonObject(eventReportFields.associateWith { JsonPrimitive(values.getValue(it).toInt()) })
}
fun eventReportReference(reference: JsonObject, field: String): String? =
    reference.text(if (field == "paxTotal") "reservationPax" else field).takeIf { it.isNotBlank() }
fun reportedFdcValue(fdc: JsonObject): Int? =
    if (fdc.text("status") == "reported") (fdc["value"] as? JsonPrimitive)?.intOrNull else null

/** References and incoming refreshes never replace an unsaved admin entry. */
class EventReportDraft(report: JsonObject) {
    val values = mutableStateMapOf<String, String>().apply { eventReportFields.forEach { put(it, report.text(it)) } }
    var dirty by mutableStateOf(false); private set
    fun edit(field: String, value: String) {
        require(field in eventReportFields)
        values[field] = value
        dirty = true
    }
    fun receive(report: JsonObject) { if (!dirty) replace(report) }
    fun saved(report: JsonObject) { replace(report); dirty = false }
    private fun replace(report: JsonObject) { eventReportFields.forEach { values[it] = report.text(it) } }
}

@Composable fun EventReport(api: Api, eventId: String, language: String = LocalLanguage.current, onSaved: () -> Unit = {}, timezone: String = "Asia/Jakarta") {
    Remote(api, "/api/admin/events/${query(eventId)}/report") { response, reload ->
        EventReportForm(api, eventId, response, language, timezone) { onSaved(); reload() }
    }
}

@Composable private fun EventReportForm(api: Api, eventId: String, response: JsonObject, language: String, timezone: String, onSaved: () -> Unit) {
    val draft = remember(eventId) { EventReportDraft(response.obj("report")) }
    var snapshot by remember(eventId) { mutableStateOf(response) }
    var fieldErrors by remember(eventId) { mutableStateOf<Map<String, String>>(emptyMap()) }
    LaunchedEffect(response) { snapshot = response; draft.receive(response.obj("report")) }
    val mutation = rememberMutation()
    val report = snapshot.obj("report")
    val canEdit = snapshot.flag("canEdit")
    Tile {
        Text(tr("ux.report.title"), style = MaterialTheme.typography.titleLarge)
        Text(tr("ux.report.body"), style = MaterialTheme.typography.bodySmall)
        if (report.isEmpty()) Text(tr("ux.report.notFilled"))
        else Text(tr("ux.report.lastEdit", "name" to report.text("updatedBy"), "date" to dateTime(report.text("updatedAt"), language, timezone)), style = MaterialTheme.typography.bodySmall)
        eventReportFields.forEach { field ->
            ReportNumberField(field, draft.values.getValue(field), { value ->
                draft.edit(field, value)
                fieldErrors = fieldErrors - field
                mutation.notice = null
            }, canEdit && !mutation.busy, eventReportReference(snapshot.obj("reference"), field), fieldErrors[field])
        }
        MutationStatus(mutation)
        if (canEdit) Action(tr("ux.report.save"), !mutation.busy) {
            fieldErrors = eventReportErrors(draft.values)
            if (fieldErrors.isEmpty()) {
                val payload = eventReportPayload(draft.values)
                mutation.run {
                    try {
                        val saved = api.request("PUT", "/api/admin/events/${query(eventId)}/report", payload)
                        snapshot = saved
                        draft.saved(saved.obj("report"))
                        mutation.notice = "ux.report.saved"
                        onSaved()
                    } catch (failure: ApiFailure) {
                        fieldErrors = failure.details.obj("error").obj("fields").mapNotNull { (key, value) ->
                            (value as? JsonPrimitive)?.contentOrNull?.takeIf { key in eventReportFields }?.let { key to it }
                        }.toMap()
                        throw failure
                    }
                }
            }
        }
        if (snapshot.rows("history").isNotEmpty()) {
            Text(tr("ux.report.history"), style = MaterialTheme.typography.titleMedium)
            snapshot.rows("history").forEach { entry ->
                HorizontalDivider()
                Text(tr("ux.report.lastEdit", "name" to entry.text("by", "—"), "date" to dateTime(entry.text("at"), language, timezone)), style = MaterialTheme.typography.bodySmall)
                eventReportFields.forEach { field ->
                    val change = entry.obj("changes").obj(field)
                    if (change.isNotEmpty()) Text(tr("ux.report.$field") + ": " + change.text("from", "—") + " → " + change.text("to", "—"))
                }
            }
        }
    }
}

@Composable private fun ReportNumberField(field: String, value: String, onChange: (String) -> Unit, enabled: Boolean, reference: String?, error: String?) {
    val label = tr("ux.report.$field")
    Column(verticalArrangement = Arrangement.spacedBy(Space.small)) {
        SectionLabel(label)
        OutlinedTextField(
            value = value, onValueChange = onChange, enabled = enabled, singleLine = true,
            modifier = Modifier.fillMaxWidth().heightIn(min = Space.control).semantics { contentDescription = label },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            isError = error != null, shape = MaterialTheme.shapes.medium,
            supportingText = {
                Column {
                    if (field == "fdcSold") Text(tr("ux.report.fdcHint"))
                    reference?.let { Text(tr("ux.report.reference", "value" to it)) }
                    error?.let { Text(tr(it), color = MaterialTheme.colorScheme.error) }
                }
            },
        )
    }
}

fun validReportPeriod(from: String, to: String): Boolean = runCatching {
    fun parse(value: String): LocalDate? {
        if (value.isEmpty()) return null
        require(Regex("^[0-9]{4}-[0-9]{2}-[0-9]{2}$").matches(value))
        return LocalDate.parse(value)
    }
    val start = parse(from); val end = parse(to)
    start == null || end == null || start <= end
}.getOrDefault(false)

fun eventReportsPath(cityId: String = "", from: String = "", to: String = ""): String {
    require(validReportPeriod(from, to))
    val params = listOf("cityId" to cityId, "from" to from, "to" to to).filter { it.second.isNotBlank() }
    return "/api/admin/event-reports" + if (params.isEmpty()) "" else params.joinToString("&", "?") { it.first + "=" + query(it.second) }
}

fun eventReportIsDue(row: JsonObject, now: Instant = Instant.now()): Boolean = row.obj("report").isEmpty() && runCatching {
    val end = Instant.parse(row.obj("event").text("endsAt"))
    end <= now && end >= now.minus(30, ChronoUnit.DAYS)
}.getOrDefault(false)

fun eventReportIsDueInPeriod(row: JsonObject, from: String, to: String, timezone: String, now: Instant = Instant.now()): Boolean =
    row.obj("report").isEmpty() && runCatching {
        val end = Instant.parse(row.obj("event").text("endsAt"))
        val date = end.atZone(ZoneId.of(timezone)).toLocalDate().toString()
        end <= now && (from.isEmpty() || date >= from) && (to.isEmpty() || date <= to)
    }.getOrDefault(false)

/** Regional scope is enforced by the endpoint; HQ can additionally filter by city. */
@Composable fun EventReports(api: Api, go: (String) -> Unit, language: String = LocalLanguage.current, hq: Boolean = false, dueOnly: Boolean = false) {
    Title(tr(if (dueOnly) "ux.workspace.pending.reportsDue" else "ux.report.dashboardTitle"), tr("ux.report.dashboardBody"))
    var cityId by remember(dueOnly) { mutableStateOf("") }
    val today = remember { LocalDate.now(ZoneId.of("Asia/Jakarta")) }
    var from by remember(dueOnly) { mutableStateOf(if (dueOnly) today.minusDays(30).toString() else "") }
    var to by remember(dueOnly) { mutableStateOf(if (dueOnly) today.toString() else "") }
    var path by remember(dueOnly) { mutableStateOf(eventReportsPath()) }
    var duePeriod by remember(dueOnly) { mutableStateOf(dueOnly) }
    var appliedFrom by remember(dueOnly) { mutableStateOf(from) }
    var appliedTo by remember(dueOnly) { mutableStateOf(to) }
    var periodError by remember(dueOnly) { mutableStateOf(false) }
    val cities = remember { mutableStateMapOf<String, String>() }
    val cityZones = remember { mutableStateMapOf<String, String>() }
    LaunchedEffect(api) {
        try {
            val events = api.request("GET", "/api/admin/events")
            (events.rows("upcoming") + events.rows("past")).forEach { event ->
                event.obj("city").text("id").takeIf { it.isNotBlank() }?.let { cityZones[it] = eventZone(event) }
            }
        } catch (failure: CancellationException) { throw failure } catch (_: Exception) { /* The report list remains usable if event context is temporarily unavailable. */ }
    }
    val mutation = rememberMutation()
    val context = LocalContext.current
    var exportPath by remember { mutableStateOf(path) }
    val export = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
        if (uri != null) mutation.run {
            val bytes = api.eventReportsCsv(exportPath + if ('?' in exportPath) "&format=csv" else "?format=csv")
            withContext(Dispatchers.IO) { context.contentResolver.openOutputStream(uri)?.use { it.write(bytes) } ?: throw ApiFailure("INTERNAL") }
        }
    }
    Remote(api, path) { data, _ ->
        val rows = data.rows("events").filter { row ->
            !dueOnly || if (duePeriod) eventReportIsDue(row) else eventReportIsDueInPeriod(
                row, appliedFrom, appliedTo, cityZones[row.obj("event").obj("city").text("id")] ?: "Asia/Jakarta")
        }
        LaunchedEffect(data, api) {
            data.rows("totals").forEach { row -> row.obj("city").let { cities[it.text("id")] = it.text("name") } }
            // The event list is capped at 20 past events. A city's representative detail supplies
            // the timezone for every historical report in that city without per-row requests.
            data.rows("events").map { it.obj("event") }.distinctBy { it.obj("city").text("id") }.forEach { event ->
                val cityId = event.obj("city").text("id")
                if (cityId.isNotBlank() && cityId !in cityZones) {
                    try {
                        val detail = api.request("GET", "/api/admin/events/${query(event.text("id"))}").obj("event")
                        if (detail.obj("city").text("id") == cityId) cityZones[cityId] = eventZone(detail)
                    } catch (failure: CancellationException) { throw failure } catch (_: Exception) { /* Keep UTC visible until city context can be loaded. */ }
                }
            }
        }
        Tile {
            if (hq) Choices(tr("ux.report.colCity"), listOf("" to tr("ux.report.allCities")) + cities.toList().sortedBy { it.second }, cityId) { cityId = it }
            Field(tr("ux.report.from") + " · YYYY-MM-DD", from, { from = it; periodError = false })
            Field(tr("ux.report.to") + " · YYYY-MM-DD", to, { to = it; periodError = false })
            if (periodError) Notice(tr("validation.dateInvalid"), true)
            Action(tr("ux.report.apply")) {
                periodError = !validReportPeriod(from, to)
                if (!periodError) {
                    duePeriod = false; appliedFrom = from; appliedTo = to
                    path = eventReportsPath(if (hq) cityId else "", if (dueOnly) "" else from, if (dueOnly) "" else to)
                }
            }
            if (!dueOnly) Action(tr("ux.report.exportCsv"), !mutation.busy, secondary = true) { exportPath = path; export.launch("pats-event-reports.csv") }
            MutationStatus(mutation)
        }
        if (rows.isEmpty()) Empty(tr("ux.report.empty"), tr("ux.report.emptyBody"))
        else {
            if (!dueOnly) {
                Text(tr("ux.report.totals"), style = MaterialTheme.typography.titleLarge)
                data.rows("totals").forEach { ReportTotals(it) }
                Text(tr("ux.report.trend"), style = MaterialTheme.typography.titleLarge)
                data.rows("trend").forEach { ReportTotals(it, monthly = true) }
            }
            Text(tr("ux.report.dashboardTitle"), style = MaterialTheme.typography.titleLarge)
            rows.forEach { row ->
                val event = row.obj("event")
                val report = row.obj("report")
                val zone = cityZones[event.obj("city").text("id")]
                Tile {
                    Text(event.text("title"), style = MaterialTheme.typography.titleMedium)
                    Detail(tr("ux.report.colCity"), event.obj("city").text("name"))
                    Detail(tr("ux.report.colDate"), if (zone != null) dateTime(event.text("startsAt"), language, zone) else event.text("startsAt"))
                    if (report.isEmpty()) Notice(tr("ux.report.notFilled"))
                    else {
                        eventReportFields.forEach { field -> Detail(tr("ux.report.$field"), count(report.number(field))) }
                        Text(tr("ux.report.lastEdit", "name" to report.text("updatedBy"), "date" to if (zone != null) dateTime(report.text("updatedAt"), language, zone) else report.text("updatedAt")), style = MaterialTheme.typography.bodySmall)
                    }
                    Action(tr("ux.report.title"), secondary = true) { go("city-event/${event.text("id")}/recap") }
                }
            }
        }
    }
}

@Composable private fun ReportTotals(row: JsonObject, monthly: Boolean = false) {
    Tile {
        Text(row.obj("city").text("name"), style = MaterialTheme.typography.titleMedium)
        if (monthly) Detail(tr("ux.report.month"), row.text("month"))
        Detail(tr("ux.report.events"), count(row.number("events")))
        Detail(tr("ux.report.reported"), count(row.number("reported")))
        eventReportFields.forEach { field -> Detail(tr("ux.report.$field"), count(row.obj("totals").number(field))) }
    }
}
