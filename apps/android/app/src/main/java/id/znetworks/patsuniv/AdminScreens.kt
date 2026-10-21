package id.znetworks.patsuniv

import android.app.AlertDialog
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
    val groups = listOf(
        "eventWork" to listOf(Triple("city-events", "app.adminEvents", "checkin.scan"), Triple("scan", "app.adminScan", "checkin.scan")),
        "crossEventQueues" to listOf(Triple("claims-review", "phase5.claimReview", "promoter.manage"), Triple("reward-validation", "loyalty.validateReward", "reward.validate")),
        "cardService" to listOf(Triple("member-cards", "uxAdmin.cardSupport", "card.reportLost"), Triple("handover", "app.adminHandover", "card.handover"), Triple("encode", "app.adminEncode", "card.encode")),
        "peopleCommunity" to listOf(Triple("operations", "uxAdmin.peopleReports", "city.operations"), Triple("community-tools", "uxAdmin.communityTools", "city.operations"))
    )
    groups.forEach { (group, items) ->
        val allowed = items.filter { hasCapability(session, it.third) }
        if (allowed.isNotEmpty()) Tile {
            SectionLabel(tr("uxAdmin.$group"))
            if (group == "eventWork") Text(tr("uxAdmin.workspaceHint"))
            allowed.forEach { (route, key, _) -> Action(tr(key), secondary = true) { go(route) } }
        }
    }
    if (hasCapability(session, "hq.manage")) Action(tr("uxShell.dashboard"), secondary = true) { go("hq-web") }
}
@Composable fun Who(api: Api, member: JsonObject) {
    Tile {
        if (member.text("photoUrl").isNotEmpty()) MemberPhoto(api, member.text("photoUrl"))
        Text(member.text("fullName"), style = MaterialTheme.typography.titleLarge); Text(member.text("nim")); Text(member.obj("city").text("name", member.text("cityName")))
        if(member.text("status").isNotBlank()) Badge(tr("common." + member.text("status").lowercase()), member.text("status"))
    }
}
@Composable fun NfcAction(reader: CardReader, key: String, busy: Boolean, returnToCards: (() -> Unit)? = null, action: () -> Unit) {
    val context = LocalContext.current
    var support by remember { mutableStateOf(reader.support()) }
    androidx.lifecycle.compose.LifecycleResumeEffect(reader) { support = reader.support(); onPauseOrDispose { } }
    when(support) {
        NfcSupport.READY -> Action(tr(if (busy) "app.scanChecking" else key), !busy) { action() }
        NfcSupport.UNSUPPORTED -> { Notice(tr(if (returnToCards == null) "uxAdmin.nfcAttendanceFallback" else "uxAdmin.nfcCrewPhone")); if (returnToCards != null) Action(tr("uxAdmin.backToCardTasks"), secondary = true, onClick = returnToCards) }
        NfcSupport.DISABLED -> { Notice(tr("nfc.disabledBody")); Action(tr("nfc.openSettings"), secondary = true) { context.startActivity(Intent(Settings.ACTION_NFC_SETTINGS)) } }
    }
}
@Composable fun Scan(api: Api, reader: CardReader, eventId: String, manual: Boolean, go: (String) -> Unit) {
    Title(tr(if (manual) "app.manualTitle" else "app.adminScan"))
    val now = adminNow()
    Remote(api, "/api/admin/events/$eventId", pollMs = 10000) { eventData, _ ->
    val currentEvent = eventData.obj("event")
    AdminEventContext(currentEvent, LocalLanguage.current)
    if (!canScanAdminEvent(currentEvent, now)) {
        Notice(tr("uxAdmin.scanClosed"))
        Text(tr("uxAdmin.checkInCloses") + ": " + dateTime(currentEvent.text("checkInClosesAt"), LocalLanguage.current, currentEvent.obj("city").text("timezone", "Asia/Jakarta")))
        Action(tr("uxAdmin.backToEvent"), secondary = true) { go("city-event/$eventId") }
    } else {
    var subject by remember { mutableStateOf<JsonObject?>(null) }; var preview by remember { mutableStateOf<JsonObject?>(null) }; var result by remember { mutableStateOf<JsonObject?>(null) }; var reason by remember { mutableStateOf("") }; var search by remember { mutableStateOf("") }; var scanCycle by remember { mutableIntStateOf(0) }
    val mutation = rememberMutation(); MutationStatus(mutation)
    fun identify(input: JsonObject) { mutation.run { subject = input; preview = api.request("POST", "/api/admin/check-in/preview", JsonObject(input + ("eventId" to JsonPrimitive(eventId)))) } }
    if (result != null) { Notice(tr("app.resultCheckedIn")); Who(api, result!!.obj("checkIn").obj("member")); Action(tr("app.resultNext")) { result = null; subject = null; preview = null; reason = ""; scanCycle++ } }
    else if (preview != null) {
        val p = preview!!; Who(api, p.obj("member"))
        val issue = p.obj("issue")
        if (issue.isNotEmpty()) Notice(when(issue.text("code")) { "ALREADY_CHECKED_IN" -> tr("app.resultAlready", "time" to dateTime(issue.text("checkedInAt"), LocalLanguage.current), "admin" to issue.text("byAdmin")); "MEMBER_INACTIVE" -> tr("app.resultInactive"); else -> tr("app.resultOtherCity", "city" to p.obj("member").obj("city").text("name")) }, true)
        if (p.flag("roaming")) Notice(tr("app.resultRoaming", "city" to p.obj("member").obj("city").text("name")))
        if (p.flag("capacityReached")) Notice(tr("app.resultCapacity"))
        var remaining by remember(p) { mutableIntStateOf(runCatching { ((Instant.parse(p.text("ticketExpiresAt")).toEpochMilli() - System.currentTimeMillis()) / 1000).toInt().coerceAtLeast(0) }.getOrDefault(0)) }
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
    }
}
@Composable fun Handover(api: Api, reader: CardReader, go: (String) -> Unit = {}) {
    Title(tr("app.handoverTitle"), tr("app.handoverBody"))
    val mutation = rememberMutation(); MutationStatus(mutation)
    var input by remember { mutableStateOf<JsonObject?>(null) }; var preview by remember { mutableStateOf<JsonObject?>(null) }; var done by remember { mutableStateOf(false) }
    if (done) { Notice(tr("app.handoverDone")); Who(api, preview!!.obj("member")); Action(tr("app.handoverNext")) { done = false; preview = null; input = null } }
    else if (preview != null) {
        val p = preview!!; Who(api, p.obj("member")); Text(tr("cardStatus." + p.obj("card").text("status")))
        if (p.obj("issue").isEmpty()) { Text(tr("app.handoverCheck")); Action(tr("app.handoverConfirm"), !mutation.busy) { mutation.run { api.request("POST", "/api/admin/cards/handover", input); done = true } } }
        else Notice(when(p.obj("issue").text("code")) { "ALREADY_DELIVERED" -> tr("app.handoverAlready", "date" to dateTime(p.obj("issue").text("at"), LocalLanguage.current), "name" to p.obj("issue").text("by")); "OTHER_CITY" -> tr("app.handoverOtherCity", "city" to p.obj("member").obj("city").text("name")); else -> tr("app.resultInactive") }, true)
        Action(tr("app.handoverAgain"), !mutation.busy, true) { preview = null; input = null }
    } else NfcAction(reader, "app.handoverTap", mutation.busy, returnToCards = { go("tools") }) { mutation.run {
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
    var task by remember { mutableStateOf("") }
    var technical by remember { mutableStateOf(false) }
    val now = adminNow()
    Remote(api, "/api/admin/cards/members/$id", pollMs = 15000) { data, reload ->
        Who(api, data.obj("member")); val card = data.rows("cards").firstOrNull { it.text("status") != "REVOKED" }; val request = data.obj("reencode")
        if (card != null) {
            Text(tr("uxAdmin.currentPhysicalCard"), style = MaterialTheme.typography.titleLarge)
            Badge(tr("cardStatus." + card.text("status")), card.text("status"))
            Text(tr("uxAdmin.cardProblem"), style = MaterialTheme.typography.titleMedium)
            if (hasCapability(session, "card.reportLost") && card.text("status") != "NOT_PRINTED") Action(tr("uxAdmin.replaceCard"), secondary = task != "replace") { task = "replace"; reason = "" }
            if (hasCapability(session, "card.requestReencode") && card.text("status") == "DELIVERED") Action(tr("uxAdmin.repairCard"), secondary = task != "repair") { task = "repair"; reason = "" }
            if (task == "replace") Tile {
                Notice(tr("uxAdmin.replaceWarning"))
                Notice(tr("uxAdmin.feeBeforeReplace"))
                Field(tr("uxAdmin.replacementReason"), reason, { reason = it.take(200) }, multiline = true)
                Decide(tr("uxAdmin.confirmReplacement"), tr("uxAdmin.replaceWarning") + " " + tr("uxAdmin.feeBeforeReplace"), !mutation.busy && reason.trim().length >= 3, secondary = true) { mutation.run { api.request("POST", "/api/admin/cards/${card.text("id")}/revoke", body("reason" to reason.trim())); reason = ""; task = ""; mutation.notice = "app.cardsRevoked"; reload() } }
            }
            if (task == "repair") Tile {
                Notice(tr("uxAdmin.repairBody"))
                if (request.text("status") in setOf("PENDING", "APPROVED") && (request.text("status") != "APPROVED" || runCatching { Instant.parse(request.text("grantExpiresAt")) > now }.getOrDefault(false))) Notice(tr("uxAdmin.repairAlreadyRequested"))
                else {
                    Field(tr("uxAdmin.repairReason"), reason, { reason = it.take(200) }, multiline = true)
                    Action(tr("uxAdmin.requestRepair"), !mutation.busy && reason.trim().length >= 3, true) { mutation.run { api.request("POST", "/api/admin/cards/${card.text("id")}/reencode-requests", body("reason" to reason.trim())); reason = ""; task = ""; mutation.notice = "app.cardsRequested"; reload() } }
                }
            }
        }
        if (request.isNotEmpty()) {
            val repairExpired = request.text("status") == "APPROVED" && runCatching { Instant.parse(request.text("grantExpiresAt")) <= now }.getOrDefault(true)
            Notice(tr("app.reencodeStatus." + if (repairExpired) "EXPIRED" else request.text("status")))
            Text(request.text("reason")); Text(request.text("decisionNote"))
            Text(tr("uxAdmin.repairOwner", "name" to request.text("requestedBy")))
            if (request.text("grantExpiresAt").isNotBlank()) Text(tr("uxAdmin.repairExpiry", "time" to dateTime(request.text("grantExpiresAt"), language)))
            if (usableRepairGrant(request, now)) Action(tr("app.reencodeNow")) { go("reencode/${request.text("id")}/${data.obj("member").text("nim")}") }
        }
        CardReplacementFees(session, api, id, language)
        Action(tr("uxAdmin.technicalDetails"), secondary = true) { technical = !technical }
        data.rows("cards").forEach { c -> Tile {
            Text(tr("cardStatus." + c.text("status")), style = MaterialTheme.typography.titleMedium)
            if (c.text("deliveredAt").isNotBlank()) Text(dateTime(c.text("deliveredAt"), language))
            if (technical) (listOf(c.obj("batch").text("label")) + listOf("nfcUid", "chipType", "encodedStation", "revokeReason").map { c.text(it) }).filter { it.isNotBlank() }.forEach { Text(it) }
        } }
    }
}
@Composable fun CardReplacementFees(session: Session, api: Api, memberId: String, language: String) {
    Remote(api, "/api/admin/payments", pollMs = 15000) { data, reload ->
        data.rows("cards").filter { it.text("memberId") == memberId }.forEach { fee -> Tile {
            Text(tr("uxAdmin.replacementFee"), style = MaterialTheme.typography.titleMedium)
            Text(money(fee.number("replacementFee")))
            Notice(tr(if (fee.text("feePaidAt").isBlank()) "uxAdmin.feeUnpaid" else "uxAdmin.feePaid"))
            Text(tr("uxAdmin.offAppPayment"))
            if (fee.text("feePaidAt").isNotBlank()) Text(dateTime(fee.text("feePaidAt"), language))
            else if (hasCapability(session, "card.reportLost")) {
                val payment = rememberMutation(); MutationStatus(payment)
                Decide(tr("uxAdmin.recordFee"), tr("uxAdmin.confirmFee", "amount" to money(fee.number("replacementFee"))), !payment.busy, secondary = true) { payment.run { api.request("POST", "/api/admin/payments", body("kind" to "card", "id" to fee.text("id"))); reload() } }
            }
        } }
    }
}
@Composable fun AdminEventDetail(session: Session, api: Api, id: String, language: String, go: (String) -> Unit) {
    val mutation = rememberMutation(); MutationStatus(mutation); val live = liveVersion(api, "attendance", id)
    var selected by androidx.compose.runtime.saveable.rememberSaveable(id) { mutableStateOf("overview") }
    val now = adminNow()
    Remote(api, "/api/admin/events/$id", refresh = live) { data, reload ->
        val e = data.obj("event")
        Title(tr("uxAdmin.eventWorkspace"))
        AdminEventContext(e, language)
        val tabs = buildList {
            add("overview" to tr("uxAdmin.overview")); add("attendance" to tr("uxAdmin.checkInAttendance"))
            if (hasCapability(session, "city.operations")) add("reservations" to tr("uxAdmin.reservations"))
            if (hasCapability(session, "promoter.manage")) add("claims" to tr("uxAdmin.claims"))
            if (hasCapability(session, "reward.validate")) add("rewards" to tr("uxAdmin.rewards"))
            if (hasCapability(session, "draw.manage")) add("draw" to tr("uxAdmin.draw"))
            if (hasCapability(session, "city.operations")) add("recap" to tr("uxAdmin.recap"))
        }
        Tabs(tabs, selected) { selected = it }
        when (selected) {
            "overview" -> {
                val zone = e.obj("city").text("timezone", "Asia/Jakarta")
                listOf("startsAt" to "starts", "endsAt" to "ends", "checkInOpensAt" to "checkInOpens", "checkInClosesAt" to "checkInCloses").forEach { (field, label) -> Text(tr("uxAdmin.$label") + ": " + dateTime(e.text(field), language, zone)) }
                if (e.text("description").isNotBlank()) Text(e.text("description"))
                if (session.me.obj("user").obj("city").isNotEmpty()) Action(tr("common.edit"), secondary = true) { go("event-edit/$id") }
                if (hasCapability(session, "checkin.scan")) adminEventActions(e, now).forEach { action ->
                    val key = when (action) { "publish" -> "events.actionPublish"; "open" -> "events.actionOpen"; else -> "events.actionClose" }
                    Decide(tr(key), tr(if (action == "close") "events.closeBody" else if (action == "publish") "events.publishBody" else "events.openBody", "city" to e.obj("city").text("name"), "time" to dateTime(e.text("checkInClosesAt"), language)), !mutation.busy, true, title = tr("events.${action}Title")) { mutation.run { api.request("POST", "/api/admin/events/$id/actions", body("action" to action)); reload() } }
                }
                if (canScanAdminEvent(e, now)) Action(tr("app.adminScan")) { go("scan/$id") }
                else Notice(tr("uxAdmin.scanClosed"))
                if (e.text("phase") == "ended") Action(tr("uxAdmin.viewRecap"), secondary = true) { selected = "recap" }
            }
            "attendance" -> {
                if (canScanAdminEvent(e, now)) Action(tr("app.adminScan")) { go("scan/$id") } else Notice(tr("uxAdmin.scanClosed"))
                AdminEventAttendance(api, id, language, live)
                if (hasCapability(session, "city.operations")) SocialOperations(session, api, language, go, mode = "attendance-access", eventId = id)
            }
            "reservations" -> SocialOperations(session, api, language, go, mode = "reservations", eventId = id)
            "claims" -> ClaimsReview(api, eventId = id)
            "rewards" -> RewardValidation(api, initialEventId = id)
            "draw" -> Draw(session, api, id, language)
            "recap" -> EventRecap(api, id)
        }
    }
}
@Composable fun AdminEventAttendance(api: Api, id: String, language: String, live: Int) {
    Text(tr("app.adminLive"), style = MaterialTheme.typography.titleLarge)
    Remote(api, "/api/admin/events/$id/attendance", refresh = live, pollMs = 5000) { data, _ ->
        Text(tr("app.attendanceCount", "count" to count(data.number("count"))))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.gap)) {
            listOf("NFC", "APP_QR", "MANUAL").forEach { method ->
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Space.small)) {
                    Badge(tr("checkInMethod.$method"))
                    Text(count(data.obj("byMethod").number(method)), style = MaterialTheme.typography.titleLarge)
                }
            }
        }
        if (data.rows("entries").isEmpty()) Empty(tr("events.attendanceEmptyTitle"), tr("events.attendanceEmptyBody"))
        data.rows("entries").forEach { row -> Tile { Text(row.obj("member").text("fullName"), style = MaterialTheme.typography.titleMedium); Text(row.obj("member").text("nim")); Text(dateTime(row.text("checkedInAt"), language)); Text(tr("checkInMethod." + row.text("method"))); Text(row.obj("admin").text("name")); if (row.text("manualReason").isNotBlank()) Text(row.text("manualReason")) } }
    }
}
fun validEventFields(values: Map<String, String>) = runCatching { LocalDate.parse(values.getValue("date")); LocalTime.parse(values.getValue("startTime")); LocalTime.parse(values.getValue("endTime")); values.getValue("title").trim().length in 2..120 && values.getOrDefault("description", "").length <= 2000 && values.getValue("opensBeforeMinutes").toInt() in 0..720 && (values.getValue("capacity").isBlank() || values.getValue("capacity").toInt() in 1..100000) }.getOrDefault(false)
// The platform DatePicker can retain the device's month-first order despite a localized context.
// Public NumberPickers keep the required day/month/year order without private framework IDs.
fun showEventDatePicker(context: android.content.Context, date: LocalDate, language: String, title: String, labels: List<String>, save: String, cancel: String, selected: (LocalDate) -> Unit) {
    val day = android.widget.NumberPicker(context).apply { minValue = 1; maxValue = date.lengthOfMonth(); value = date.dayOfMonth }
    val month = android.widget.NumberPicker(context).apply { minValue = 1; maxValue = 12; displayedValues = java.text.DateFormatSymbols(java.util.Locale.forLanguageTag(if (language == "en") "en-GB" else "id-ID")).shortMonths.take(12).toTypedArray(); value = date.monthValue }
    val year = android.widget.NumberPicker(context).apply { minValue = minOf(1900, date.year); maxValue = maxOf(2100, date.year); value = date.year }
    fun clampDay() { val maximum = YearMonth.of(year.value, month.value).lengthOfMonth(); if(day.value > maximum) day.value = maximum; day.maxValue = maximum }
    month.setOnValueChangedListener { _, _, _ -> clampDay() }; year.setOnValueChangedListener { _, _, _ -> clampDay() }
    val row = android.widget.LinearLayout(context).apply { orientation = android.widget.LinearLayout.HORIZONTAL }
    listOf(day, month, year).forEachIndexed { index, picker ->
        picker.contentDescription = labels[index]
        row.addView(android.widget.LinearLayout(context).apply {
            orientation = android.widget.LinearLayout.VERTICAL; gravity = android.view.Gravity.CENTER_HORIZONTAL
            addView(android.widget.TextView(context).apply { text = labels[index]; gravity = android.view.Gravity.CENTER })
            addView(picker)
        }, android.widget.LinearLayout.LayoutParams(0, android.view.ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    }
    AlertDialog.Builder(context).setTitle(title).setView(row).setPositiveButton(save) { _, _ ->
        row.clearFocus(); selected(LocalDate.of(year.value, month.value, day.value))
    }.setNegativeButton(cancel, null).show()
}
@Composable fun EventEditor(api: Api, id: String, go: (String) -> Unit) {
    Title(tr(if (id.isEmpty()) "events.create" else "events.editTitle"))
    Remote(api, "/api/admin/event-form") { meta, _ ->
        if (id.isEmpty()) EventForm(api, meta, null, id, go)
        else Remote(api, "/api/admin/events/$id") { current, _ -> EventForm(api, meta, current.obj("form"), id, go) }
    }
}
@Composable fun EventForm(api: Api, meta: JsonObject, initial: JsonObject?, id: String, go: (String) -> Unit) {
    val baseContext = LocalContext.current; val language = LocalLanguage.current
    val context = remember(baseContext, language) { android.view.ContextThemeWrapper(baseContext, R.style.PatsTheme).apply { applyOverrideConfiguration(android.content.res.Configuration().apply { setLocale(java.util.Locale.forLanguageTag(if (language == "en") "en-GB" else "id-ID")) }) } }
    val values = remember(initial) { mutableStateMapOf("title" to initial?.text("title").orEmpty(), "description" to initial?.text("description").orEmpty(), "venueId" to initial?.text("venueId").orEmpty(), "date" to (initial?.text("date") ?: LocalDate.now(ZoneId.of(meta.obj("city").text("timezone", "Asia/Jakarta"))).toString()), "startTime" to (initial?.text("startTime") ?: "20:00"), "endTime" to (initial?.text("endTime") ?: "02:00"), "opensBeforeMinutes" to (initial?.text("opensBeforeMinutes") ?: meta.text("opensBeforeMinutes", "60")), "capacity" to initial?.text("capacity").orEmpty()) }
    var publish by remember { mutableStateOf(initial?.flag("publish") ?: true) }; val mutation = rememberMutation(); MutationStatus(mutation)
    Field(tr("events.eventTitle"), values.getValue("title"), { values["title"] = it.take(120) })
    val date = LocalDate.parse(values.getValue("date"))
    val dateTitle = tr("events.date") + " · " + tr("ops.datePlaceholder")
    val dateLabels = listOf(tr("join.dobDay"), tr("join.dobMonth"), tr("join.dobYear"))
    val saveDate = tr("common.save"); val cancelDate = tr("common.cancel")
    Action(tr("events.date") + ": " + date.format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy")), secondary = true) { showEventDatePicker(context, date, language, dateTitle, dateLabels, saveDate, cancelDate) { values["date"] = it.toString() } }
    listOf("startTime", "endTime").forEach { key -> val time = LocalTime.parse(values.getValue(key)); Action(tr("events.$key") + " (" + zoneLabel(meta.obj("city").text("timezone", "Asia/Jakarta")) + "): " + values.getValue(key).replace(':', '.'), secondary = true) { TimePickerDialog(context, { _, h, m -> values[key] = "%02d:%02d".format(h, m) }, time.hour, time.minute, true).show() } }
    Text(tr("events.endHint"), style = MaterialTheme.typography.bodySmall)
    Choices(tr("events.venue"), listOf("" to tr("app.eventFormVenueNone")) + meta.rows("venues").map { it.text("id") to it.text("name") }, values.getValue("venueId")) { values["venueId"] = it }
    Field(tr("events.opensBefore"), values.getValue("opensBeforeMinutes"), { values["opensBeforeMinutes"] = it }, KeyboardType.Number)
    Field(tr("events.capacity") + " · " + tr("common.optional"), values.getValue("capacity"), { values["capacity"] = it }, KeyboardType.Number)
    Field(tr("events.description"), values.getValue("description"), { values["description"] = it.take(2000) }, multiline = true)
    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.gap)) { Switch(publish, { publish = it }); Text(tr("events.publish")) }
    Action(tr("common.save"), !mutation.busy && validEventFields(values)) { mutation.run { val payload = JsonObject(values.mapValues { JsonPrimitive(it.value) } + ("publish" to JsonPrimitive(publish))); val saved = api.request(if (id.isEmpty()) "POST" else "PATCH", "/api/admin/events" + if (id.isEmpty()) "" else "/$id", payload); go("city-event/" + saved.obj("event").text("id", id)) } }
}
