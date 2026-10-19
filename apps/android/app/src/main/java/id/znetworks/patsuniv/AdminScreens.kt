package id.znetworks.patsuniv

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import kotlinx.coroutines.*
import kotlinx.serialization.json.*
import java.time.*

@Composable fun AdminTools(session: Session, go: (String) -> Unit) {
    Title(tr("app.adminTitle"), if (hasCapability(session, "hq.manage")) tr("app.adminSubtitleHq") else tr("app.adminSubtitle", "city" to session.me.obj("user").obj("city").text("name")))
    listOf(
        Triple("scan", "app.adminScan", "checkin.scan"), Triple("city-events", "app.adminEvents", "checkin.scan"),
        Triple("claims-review", "phase5.claimReview", "promoter.manage"), Triple("reward-validation", "loyalty.validateReward", "reward.validate"),
        Triple("operations", "loyalty.operations", "city.operations"), Triple("social-operations", "social.operations", "city.operations"),
        Triple("handover", "app.adminHandover", "card.handover"), Triple("member-cards", "app.adminCards", "card.reportLost"), Triple("encode", "app.adminEncode", "card.encode")
    ).filter { hasCapability(session, it.third) }.forEach { (route, key, _) -> Action(tr(key), secondary = true) { go(route) } }
    Action(tr("app.notificationsTitle"), secondary = true) { go("notifications") }
}
@Composable fun Who(api: Api, member: JsonObject) {
    Tile {
        if (member.text("photoUrl").isNotEmpty()) MemberPhoto(api, member.text("photoUrl"))
        Text(member.text("fullName"), style = MaterialTheme.typography.titleLarge); Text(member.text("nim")); Text(member.obj("city").text("name", member.text("cityName")))
        if(member.text("status").isNotBlank()) Badge(tr("common." + member.text("status").lowercase()), member.text("status"))
    }
}
@Composable fun NfcAction(reader: CardReader, key: String, busy: Boolean, action: () -> Unit) {
    val context = LocalContext.current
    var support by remember { mutableStateOf(reader.support()) }
    androidx.lifecycle.compose.LifecycleResumeEffect(reader) { support = reader.support(); onPauseOrDispose { } }
    when(support) {
        NfcSupport.READY -> Action(tr(if (busy) "app.scanChecking" else key), !busy) { action() }
        NfcSupport.UNSUPPORTED -> Notice(tr("nfc.unsupportedBody"))
        NfcSupport.DISABLED -> { Notice(tr("nfc.disabledBody")); Action(tr("nfc.openSettings"), secondary = true) { context.startActivity(Intent(Settings.ACTION_NFC_SETTINGS)) } }
    }
}
@Composable fun Scan(api: Api, reader: CardReader, eventId: String, manual: Boolean, go: (String) -> Unit) {
    Title(tr(if (manual) "app.manualTitle" else "app.adminScan"))
    var subject by remember { mutableStateOf<JsonObject?>(null) }; var preview by remember { mutableStateOf<JsonObject?>(null) }; var result by remember { mutableStateOf<JsonObject?>(null) }; var reason by remember { mutableStateOf("") }; var search by remember { mutableStateOf("") }; var scanCycle by remember { mutableIntStateOf(0) }
    val mutation = rememberMutation(); MutationStatus(mutation)
    fun identify(input: JsonObject) { mutation.run { subject = input; preview = api.request("POST", "/api/admin/check-in/preview", JsonObject(input + ("eventId" to JsonPrimitive(eventId)))) } }
    Remote(api, "/api/admin/events/$eventId") { data, _ -> Text(data.obj("event").text("title"), style = MaterialTheme.typography.titleMedium) }
    if (result != null) { Notice(tr("app.resultCheckedIn")); Who(api, result!!.obj("checkIn").obj("member")); Action(tr("app.resultNext")) { result = null; subject = null; preview = null; reason = ""; scanCycle++ } }
    else if (preview != null) {
        val p = preview!!; Who(api, p.obj("member"))
        val issue = p.obj("issue")
        if (issue.isNotEmpty()) Notice(when(issue.text("code")) { "ALREADY_CHECKED_IN" -> tr("app.resultAlready", "time" to dateTime(issue.text("checkedInAt")), "admin" to issue.text("byAdmin")); "MEMBER_INACTIVE" -> tr("app.resultInactive"); else -> tr("app.resultOtherCity", "city" to p.obj("member").obj("city").text("name")) }, true)
        if (p.flag("roaming")) Notice(tr("app.resultRoaming", "city" to p.obj("member").obj("city").text("name")))
        if (p.flag("capacityReached")) Notice(tr("app.resultCapacity"))
        var remaining by remember(p) { mutableIntStateOf(120) }
        LaunchedEffect(p) { if (p.text("ticketExpiresAt").isNotEmpty()) while (isActive) { remaining = runCatching { ((Instant.parse(p.text("ticketExpiresAt")).toEpochMilli() - System.currentTimeMillis()) / 1000).toInt().coerceAtLeast(0) }.getOrDefault(0); delay(1000) } }
        val isManual = subject?.text("method") == "MANUAL"
        if (isManual) { Field(tr("app.manualReason"), reason, { reason = it.take(200) }, multiline = true); Text(tr("app.manualReasonHint"), style = MaterialTheme.typography.bodySmall) }
        else Text(tr("app.resultExpiresIn", "seconds" to remaining.toString()))
        Action(tr("app.resultConfirm"), !mutation.busy && issue.isEmpty() && if (isManual) reason.trim().length >= 3 else remaining > 0 && p.text("ticket").isNotEmpty(), maroon = true) {
            mutation.run { result = api.request("POST", "/api/admin/check-in", if (isManual) body("eventId" to eventId, "method" to "MANUAL", "memberId" to subject!!.text("memberId"), "reason" to reason.trim()) else body("eventId" to eventId, "method" to subject!!.text("method"), "ticket" to p.text("ticket"))) }
        }
        Action(tr("app.scanAgain"), !mutation.busy, true) { preview = null; subject = null; scanCycle++ }
    } else if (manual) {
        Field(tr("app.manualSearch"), search, { search = it })
        if (search.trim().length < 2) Empty(tr("app.manualHintTitle"), tr("app.manualHintBody")) else Remote(api, "/api/admin/events/$eventId/members?q=${query(search.trim())}") { data, _ ->
            if (data.rows("members").isEmpty()) Empty(tr("app.manualEmptyTitle"), tr("app.cardsSearchEmpty"))
            data.rows("members").forEach { member -> Tile { Text(member.text("nim")); Action(member.text("fullName"), !mutation.busy, true) { identify(body("method" to "MANUAL", "memberId" to member.text("id"))) } } }
        }
    } else {
        NfcAction(reader, "app.scanTapCard", mutation.busy) { mutation.run {
            val tag = reader.withTag { Ntag.inspect(it) }; val token = cardToken(tag.url.orEmpty()) ?: throw ApiFailure("CARD_INVALID")
            val input = body("method" to "NFC", "token" to token, "nfcUid" to tag.uid); subject = input; preview = api.request("POST", "/api/admin/check-in/preview", JsonObject(input + ("eventId" to JsonPrimitive(eventId))))
        } }
        if (mutation.failure != null) Action(tr("app.scanAgain"), !mutation.busy, true) { mutation.run { subject = null; scanCycle++ } }
        else if (!mutation.busy) key(scanCycle) { QrScanner { value -> identify(body("method" to "APP_QR", "token" to value)) } }
        Notice(tr("app.scanNotRecorded"))
        Action(tr("app.scanManual"), !mutation.busy, true) { go("manual/$eventId") }
    }
}
@Composable fun Handover(api: Api, reader: CardReader) {
    Title(tr("app.handoverTitle"), tr("app.handoverBody"))
    val mutation = rememberMutation(); MutationStatus(mutation)
    var input by remember { mutableStateOf<JsonObject?>(null) }; var preview by remember { mutableStateOf<JsonObject?>(null) }; var done by remember { mutableStateOf(false) }
    if (done) { Notice(tr("app.handoverDone")); Who(api, preview!!.obj("member")); Action(tr("app.handoverNext")) { done = false; preview = null; input = null } }
    else if (preview != null) {
        val p = preview!!; Who(api, p.obj("member")); Text(tr("cardStatus." + p.obj("card").text("status")))
        if (p.obj("issue").isEmpty()) { Text(tr("app.handoverCheck")); Action(tr("app.handoverConfirm"), !mutation.busy) { mutation.run { api.request("POST", "/api/admin/cards/handover", input); done = true } } }
        else Notice(when(p.obj("issue").text("code")) { "ALREADY_DELIVERED" -> tr("app.handoverAlready", "date" to dateTime(p.obj("issue").text("at")), "name" to p.obj("issue").text("by")); "OTHER_CITY" -> tr("app.handoverOtherCity", "city" to p.obj("member").obj("city").text("name")); else -> tr("app.resultInactive") }, true)
        Action(tr("app.handoverAgain"), !mutation.busy, true) { preview = null; input = null }
    } else NfcAction(reader, "app.handoverTap", mutation.busy) { mutation.run {
        val tag = reader.withTag { Ntag.inspect(it) }; val token = cardToken(tag.url.orEmpty()) ?: throw ApiFailure("CARD_INVALID")
        input = body("token" to token, "nfcUid" to tag.uid); preview = api.request("POST", "/api/admin/cards/handover/preview", input)
    } }
}
@Composable fun MemberCards(api: Api, go: (String) -> Unit) {
    Title(tr("app.adminCards"), tr("app.cardsSearchHint"))
    var search by remember { mutableStateOf("") }; Field(tr("common.search"), search, { search = it })
    if (search.trim().length >= 2) Remote(api, "/api/admin/cards/members?q=${query(search.trim())}") { data, _ ->
        if (data.rows("members").isEmpty()) Notice(tr("app.cardsSearchEmpty"))
        data.rows("members").forEach { member -> Tile { Text(member.text("nim")); Text(tr("cardStatus." + member.obj("card").text("status", "NOT_PRINTED"))); Action(member.text("fullName"), secondary = true) { go("member-card/" + member.text("id")) } } }
    }
}
@Composable fun MemberCardDetail(session: Session, api: Api, id: String, language: String, go: (String) -> Unit) {
    val mutation = rememberMutation(); MutationStatus(mutation)
    var reason by remember { mutableStateOf("") }
    Remote(api, "/api/admin/cards/members/$id", pollMs = 15000) { data, reload ->
        Who(api, data.obj("member")); val card = data.rows("cards").firstOrNull { it.text("status") != "REVOKED" }; val request = data.obj("reencode")
        if (card != null) {
            Field(tr("app.manualReason"), reason, { reason = it.take(200) }, multiline = true)
            if (hasCapability(session, "card.reportLost") && card.text("status") != "NOT_PRINTED") Decide(tr("app.cardsLostConfirm"), tr("app.cardsLostConfirmBody"), !mutation.busy && reason.trim().length >= 3, true) { mutation.run { api.request("POST", "/api/admin/cards/${card.text("id")}/revoke", body("reason" to reason.trim())); reason = ""; mutation.notice = "app.cardsRevoked"; reload() } }
            if (hasCapability(session, "card.requestReencode") && card.text("status") == "DELIVERED" && request.text("status") !in setOf("PENDING", "APPROVED")) Action(tr("app.cardsReencodeTitle"), !mutation.busy && reason.trim().length >= 3, true) { mutation.run { api.request("POST", "/api/admin/cards/${card.text("id")}/reencode-requests", body("reason" to reason.trim())); reason = ""; mutation.notice = "app.cardsRequested"; reload() } }
        }
        if (request.isNotEmpty()) {
            Notice(tr("app.reencodeStatus." + request.text("status")))
            Text(request.text("reason")); Text(request.text("decisionNote"))
            if (request.text("status") == "APPROVED" && request.flag("mine") && runCatching { Instant.parse(request.text("grantExpiresAt")) > Instant.now() }.getOrDefault(false)) Action(tr("app.reencodeNow")) { go("reencode/${request.text("id")}/${data.obj("member").text("nim")}") }
        }
        data.rows("cards").forEach { c -> Tile {
            Text(tr("cardStatus." + c.text("status")), style = MaterialTheme.typography.titleMedium); (listOf(c.obj("batch").text("label")) + listOf("nfcUid", "chipType", "encodedStation", "revokeReason").map { c.text(it) }).filter { it.isNotBlank() }.forEach { Text(it) }; if (c.text("deliveredAt").isNotBlank()) Text(dateTime(c.text("deliveredAt"), language))
        } }
    }
}
@Composable fun AdminEventDetail(session: Session, api: Api, id: String, language: String, go: (String) -> Unit) {
    val mutation = rememberMutation(); MutationStatus(mutation); val live = liveVersion(api, "attendance", id)
    Remote(api, "/api/admin/events/$id", refresh = live) { data, reload ->
        val e = data.obj("event"); Title(e.text("title"), e.obj("city").text("name")); Text(dateTime(e.text("startsAt"), language, e.obj("city").text("timezone", "Asia/Jakarta"))); if (e.text("description").isNotBlank()) Text(e.text("description")); Text(tr("eventPhase." + e.text("phase")))
        if (session.me.obj("user").obj("city").isNotEmpty()) Action(tr("common.edit"), secondary = true) { go("event-edit/$id") }
        listOf("publish" to "events.actionPublish", "open" to "events.actionOpen", "close" to "events.actionClose").filter { (action, _) -> when(action) { "publish" -> e.text("status") == "DRAFT"; "open" -> e.text("status") != "OPEN" && e.text("phase") != "ended"; else -> e.text("status") == "OPEN" } }.forEach { (action, key) ->
            Decide(tr(key), tr(if (action == "close") "events.closeBody" else if (action == "publish") "events.publishBody" else "events.openBody", "city" to e.obj("city").text("name"), "time" to dateTime(e.text("checkInClosesAt"), language)), !mutation.busy, true, title = tr("events.${action}Title")) { mutation.run { api.request("POST", "/api/admin/events/$id/actions", body("action" to action)); reload() } }
        }
        Action(tr("app.adminScan")) { go("scan/$id") }; Action(tr("phase5.draw"), secondary = true) { go("draw/$id") }
    }
    Text(tr("app.adminLive"), style = MaterialTheme.typography.titleLarge)
    Remote(api, "/api/admin/events/$id/attendance", refresh = live, pollMs = 5000) { data, _ ->
        Text(tr("app.attendanceCount", "count" to count(data.number("count"))))
        if (data.rows("entries").isEmpty()) Empty(tr("events.attendanceEmptyTitle"), tr("events.attendanceEmptyBody"))
        data.rows("entries").forEach { row -> Tile { Text(row.obj("member").text("fullName"), style = MaterialTheme.typography.titleMedium); Text(row.obj("member").text("nim")); Text(dateTime(row.text("checkedInAt"), language)); Text(tr("checkInMethod." + row.text("method"))); Text(row.obj("admin").text("name")); if (row.text("manualReason").isNotBlank()) Text(row.text("manualReason")) } }
    }
}
fun validEventFields(values: Map<String, String>) = runCatching { LocalDate.parse(values.getValue("date")); LocalTime.parse(values.getValue("startTime")); LocalTime.parse(values.getValue("endTime")); values.getValue("title").trim().length in 2..120 && values.getOrDefault("description", "").length <= 2000 && values.getValue("opensBeforeMinutes").toInt() in 0..720 && (values.getValue("capacity").isBlank() || values.getValue("capacity").toInt() in 1..100000) }.getOrDefault(false)
@Composable fun EventEditor(api: Api, id: String, go: (String) -> Unit) {
    Title(tr(if (id.isEmpty()) "events.create" else "events.editTitle"))
    Remote(api, "/api/admin/event-form") { meta, _ ->
        if (id.isEmpty()) EventForm(api, meta, null, id, go)
        else Remote(api, "/api/admin/events/$id") { current, _ -> EventForm(api, meta, current.obj("form"), id, go) }
    }
}
@Composable fun EventForm(api: Api, meta: JsonObject, initial: JsonObject?, id: String, go: (String) -> Unit) {
    val baseContext = LocalContext.current; val language = LocalLanguage.current
    val context = remember(baseContext, language) { android.view.ContextThemeWrapper(baseContext, R.style.PatsTheme).apply { applyOverrideConfiguration(android.content.res.Configuration().apply { setLocale(java.util.Locale.forLanguageTag(language)) }) } }
    val values = remember(initial) { mutableStateMapOf("title" to initial?.text("title").orEmpty(), "description" to initial?.text("description").orEmpty(), "venueId" to initial?.text("venueId").orEmpty(), "date" to (initial?.text("date") ?: LocalDate.now(ZoneId.of(meta.obj("city").text("timezone", "Asia/Jakarta"))).toString()), "startTime" to (initial?.text("startTime") ?: "20:00"), "endTime" to (initial?.text("endTime") ?: "02:00"), "opensBeforeMinutes" to (initial?.text("opensBeforeMinutes") ?: meta.text("opensBeforeMinutes", "60")), "capacity" to initial?.text("capacity").orEmpty()) }
    var publish by remember { mutableStateOf(initial?.flag("publish") ?: true) }; val mutation = rememberMutation(); MutationStatus(mutation)
    Field(tr("events.eventTitle"), values.getValue("title"), { values["title"] = it.take(120) })
    val date = LocalDate.parse(values.getValue("date"))
    Action(tr("events.date") + ": " + date.format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy")), secondary = true) { DatePickerDialog(context, { _, y, m, d -> values["date"] = "%04d-%02d-%02d".format(y, m + 1, d) }, date.year, date.monthValue - 1, date.dayOfMonth).show() }
    listOf("startTime", "endTime").forEach { key -> val time = LocalTime.parse(values.getValue(key)); Action(tr("events.$key") + " (" + zoneLabel(meta.obj("city").text("timezone", "Asia/Jakarta")) + "): " + values.getValue(key).replace(':', '.'), secondary = true) { TimePickerDialog(context, { _, h, m -> values[key] = "%02d:%02d".format(h, m) }, time.hour, time.minute, true).show() } }
    Text(tr("events.endHint"), style = MaterialTheme.typography.bodySmall)
    Choices(tr("events.venue"), listOf("" to tr("app.eventFormVenueNone")) + meta.rows("venues").map { it.text("id") to it.text("name") }, values.getValue("venueId")) { values["venueId"] = it }
    Field(tr("events.opensBefore"), values.getValue("opensBeforeMinutes"), { values["opensBeforeMinutes"] = it }, KeyboardType.Number)
    Field(tr("events.capacity") + " · " + tr("common.optional"), values.getValue("capacity"), { values["capacity"] = it }, KeyboardType.Number)
    Field(tr("events.description"), values.getValue("description"), { values["description"] = it.take(2000) }, multiline = true)
    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.gap)) { Switch(publish, { publish = it }); Text(tr("events.publish")) }
    Action(tr("common.save"), !mutation.busy && validEventFields(values)) { mutation.run { val payload = JsonObject(values.mapValues { JsonPrimitive(it.value) } + ("publish" to JsonPrimitive(publish))); val saved = api.request(if (id.isEmpty()) "POST" else "PATCH", "/api/admin/events" + if (id.isEmpty()) "" else "/$id", payload); go("city-event/" + saved.obj("event").text("id", id)) } }
}
