package id.znetworks.patsuniv

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.text.input.KeyboardType
import kotlinx.serialization.json.*

@Composable fun ClaimsReview(api: Api, eventId: String = "") {
    Title(tr("phase5.claimReview"), tr("phase5.claimAdjustHint"))
    var selected by remember { mutableStateOf("pending") }
    Remote(api, "/api/admin/loyalty/claims" + if (eventId.isBlank()) "" else "?eventId=${query(eventId)}", pollMs = 15000) { data, reload ->
        val scoped = data.rows("claims").filter { eventId.isBlank() || it.text("eventId") == eventId }
        val pending = scoped.count { it.text("status") == "PENDING" }
        Tabs(listOf("pending" to tr("native.pending"), "history" to tr("native.history")), selected, mapOf("pending" to pending)) { selected = it }
        val claims = scoped.filter { (it.text("status") == "PENDING") == (selected == "pending") }
        if(claims.isEmpty()) Empty(tr("phase5.claimEmpty"), tr("phase5.claimAdjustHint"))
        claims.forEach { c -> key(c.text("id"), c.text("status"), c.flag("glAllowed"), c["editableFields"]) { ClaimReview(api, c, reload, data.obj("rules")) } }
    }
}
@Composable fun ClaimReview(api: Api, c: JsonObject, reload: () -> Unit, rules: JsonObject = body()) {
    var guests by remember { mutableStateOf(c.text("guestCount")) }; var reservations by remember { mutableStateOf(c.text("reservationCount")) }; var reason by remember { mutableStateOf("") }; var receipt by remember { mutableStateOf("") }; val mutation = rememberMutation()
    Tile {
        Text(c.obj("member").text("fullName"), style = MaterialTheme.typography.titleLarge); Text(c.obj("event").text("title")); Text(tr(if (c.text("formType") == "PR") "phase5.claimPr" else "phase5.claimMember") + " · " + tr("social." + c.text("status"))); Text(c.text("notes"))
        MutationStatus(mutation)
        if (c.text("receiptUrl").isNotBlank()) Action(tr("loyalty.viewReceipt"), !mutation.busy, true) { mutation.run { receipt = api.request("GET", "/api/loyalty/claims/${c.text("id")}/receipt?format=json").text("url") } }
        if (receipt.isNotBlank()) NetworkImage(api, receipt)
        if (c.text("status") == "PENDING") {
            val allowGuests = claimFieldEditable(c, "guestCount")
            val allowReservations = claimFieldEditable(c, "reservationCount")
            if (allowGuests) Field(tr("phase5.guestCount"), guests, { guests = it }, KeyboardType.Number)
            else if (!c.flag("glAllowed")) Text(tr("ux.claims.glNotAllowed"), style = MaterialTheme.typography.bodySmall)
            if (allowReservations) Field(tr("phase5.reservationCount"), reservations, { reservations = it }, KeyboardType.Number)
            else Text(tr("phase5.reservationCount") + ": " + count(c.number("reservationCount")))
            Field(tr("phase5.reason"), reason, { reason = it.take(1000) }, multiline = true)
            Text(tr("ux.claims.reasonRequired"), style = MaterialTheme.typography.bodySmall)
            val reasonMin = rules.number("rejectReasonMin").coerceAtLeast(3)
            listOf("APPROVED" to "phase5.approve", "REJECTED" to "phase5.reject").forEach { (decision, key) -> Decide(tr(key), if (decision == "APPROVED") tr("phase5.claimApproveConfirm") else reason, !mutation.busy && reason.trim().length <= 1000 && (if (decision == "APPROVED") (!allowGuests || validCount(guests)) && (!allowReservations || validCount(reservations)) else reason.trim().length >= reasonMin), decision == "REJECTED") { mutation.run { api.request("POST", "/api/admin/loyalty/claims", claimReviewPayload(c.text("id"), decision, guests, reservations, reason, allowGuests, allowReservations)); reload() } } }
        } else { Text(count(c.number("bonusValue")) + " XP"); if (c.text("rejectReason").isNotBlank()) Notice(c.text("rejectReason"), true) }
    }
}
@Composable fun RewardValidation(api: Api, initialEventId: String = "") {
    Title(tr("loyalty.validateReward"))
    var eventId by remember(initialEventId) { mutableStateOf(initialEventId) }; var code by remember { mutableStateOf("") }; var camera by remember { mutableStateOf(false) }; var preview by remember { mutableStateOf<JsonObject?>(null) }; val mutation = rememberMutation(); MutationStatus(mutation)
    Remote(api, "/api/admin/loyalty/operations") { data, _ ->
        val event = data.rows("events").find { it.text("id") == eventId } ?: if (eventId.isBlank()) data.rows("events").firstOrNull() else null
        if (initialEventId.isBlank()) Choices(tr("loyalty.event"), data.rows("events").map { it.text("id") to it.text("title") + " · " + it.obj("city").text("name") }, event?.text("id").orEmpty()) { eventId = it; preview = null; camera = false }
        if (event == null) Notice(tr("uxAdmin.eventUnavailable"))
        fun lookup(value: String) { camera = false; code = value.uppercase(); preview = null; mutation.run { preview = api.request("POST", "/api/admin/loyalty/codes/preview", body("code" to code, "eventId" to event!!.text("id"))).obj("redemption") } }
        Field(tr("loyalty.code"), code, { code = it.uppercase().take(6); preview = null })
        Action(tr("loyalty.lookup"), !mutation.busy && event != null && Regex("^[A-Z0-9]{6}$").matches(code)) { lookup(code) }
        Action(tr("loyalty.scanCode"), !mutation.busy && event != null, true) { camera = !camera }
        if (camera) QrScanner { if (Regex("^[A-Z0-9]{6}$").matches(it)) lookup(it) else { camera = false; mutation.run { throw ApiFailure("VALIDATION") } } }
        preview?.let { redemption -> Tile {
            Text(redemption.obj("reward").text("name"), style = MaterialTheme.typography.titleLarge); Text(redemption.obj("member").text("fullName")); Text(redemption.obj("member").text("nim")); Text(redemption.text("code"))
            Decide(tr("loyalty.fulfill"), redemption.obj("reward").text("name"), !mutation.busy) { mutation.run { try { api.request("POST", "/api/admin/loyalty/codes/fulfill", body("code" to redemption.text("code"), "eventId" to event!!.text("id"))); code = ""; mutation.notice = "loyalty.fulfilled" } finally { preview = null } } }
        } }
    }
}
@Composable fun CrewOperations(api: Api, go: (String) -> Unit) {
    Title(tr("loyalty.operations"), tr("loyalty.operationsBody"))
    val mutation = rememberMutation(); MutationStatus(mutation); var eventId by remember { mutableStateOf("") }; var search by remember { mutableStateOf("") }
    Remote(api, "/api/admin/loyalty/operations") { data, reload ->
        Tile { listOf("members", "checkIns", "fulfilled", "revenue").forEach { key -> Text(tr("loyalty." + if (key == "fulfilled") "fulfilledCount" else key) + ": " + if (key == "revenue") money(data.obj("stats").number(key)) else count(data.obj("stats").number(key))) } }
        Action(tr("phase5.claimReview"), secondary = true) { go("claims-review") }
        Text(tr("uxAdmin.archivedEvents"), style = MaterialTheme.typography.titleLarge)
        val event = data.rows("events").find { it.text("id") == eventId } ?: data.rows("events").firstOrNull()
        Choices(tr("loyalty.event"), data.rows("events").map { it.text("id") to it.text("title") }, event?.text("id").orEmpty()) { eventId = it }
        if (event != null) {
            Text(tr("ux.report.fdcSold") + ": " + (reportedFdcValue(event.obj("fdcSold"))?.let(::count) ?: tr("ux.report.notFilled")))
            Action(tr("uxAdmin.openWorkspace"), secondary = true) { go("city-event/${event.text("id")}") }
        }
        Text(tr("loyalty.promoterFlag"), style = MaterialTheme.typography.titleLarge); Field(tr("loyalty.member"), search, { search = it })
        data.rows("members").filter { (it.text("fullName") + it.text("nim")).contains(search, true) }.take(20).forEach { m -> Tile {
            Text(m.text("fullName") + " · " + m.text("nim"))
            Decide(tr(if (m.flag("isPromoter")) "loyalty.removePromoter" else "loyalty.grantPromoter"), m.text("fullName"), !mutation.busy, true) { mutation.run { api.request("POST", "/api/admin/loyalty/promoters/${m.text("id")}", body("enabled" to !m.flag("isPromoter"))); reload() } }
        } }
        Text(tr("ux.archive.prReports"), style = MaterialTheme.typography.titleLarge)
        Text(tr("ux.archive.prReportsBody"))
        if (data.rows("reports").isEmpty()) Empty(tr("loyalty.emptyReports"), tr("loyalty.emptyReportsBody"))
        data.rows("reports").forEach { report -> LegacyReport(api, report) }
    }
}
@Composable fun EventRecap(api: Api, eventId: String, workspace: JsonObject, reload: () -> Unit) {
            val event = workspace.obj("event")
            val recapState = workspace.obj("recap")
            val recap = recapState.obj("saved")
            val sold = recapState.obj("reservationsSold")
            Text(tr("ux.recap.sold"), style = MaterialTheme.typography.titleLarge)
            Text(tr("ux.recap.soldHint"), style = MaterialTheme.typography.bodySmall)
            Tile {
                Text(tr("ux.recap.soldTable") + ": " + if (sold.isEmpty()) "—" else count(sold.number("table")))
                Text(tr("ux.recap.soldSofa") + ": " + if (sold.isEmpty()) "—" else count(sold.number("sofa")))
                Text(tr("ux.report.fdcSold") + ": " + (reportedFdcValue(recapState.obj("fdcSold"))?.let(::count) ?: tr("ux.report.notFilled")))
            }
            if (runCatching { java.time.Instant.parse(event.text("endsAt")) <= java.time.Instant.now() }.getOrDefault(false)) key(eventId, recap) { RecapForm(api, eventId, recap, reload) }
            else Notice(tr("uxAdmin.recapAfterEvent"))
}
@Composable fun RecapForm(api: Api, eventId: String, recap: JsonObject, reload: () -> Unit) {
    val fields = listOf("sofaCount", "tableCount", "paxCount", "revenueSofa", "revenueTable")
    val values = remember(eventId, recap) { mutableStateMapOf<String, String>().apply { fields.forEach { put(it, recap.text(it, "0")) }; put("personInCharge", recap.text("personInCharge")); put("accountablePerson", recap.text("accountablePerson")); put("note", recap.text("note")) } }
    val mutation = rememberMutation()
    Tile {
        SectionLabel(tr("uxAdmin.manualRecap"))
        Text(tr("uxAdmin.manualRecapBody"), style = MaterialTheme.typography.bodySmall)
        if (recap.isNotEmpty()) Text(tr("loyalty.total") + ": " + money(recap.number("total")))
        val locked = recap.text("lockedAt").isNotBlank()
        if (locked) Notice(tr("loyalty.locked"))
        fields.forEach { key -> Field(tr("loyalty.$key"), values.getValue(key), { if (!locked) values[key] = it }, KeyboardType.Number, moneyInput = key.startsWith("revenue")) }
        listOf("personInCharge", "accountablePerson").forEach { key -> Field(tr("phase5.$key"), values.getValue(key), { if (!locked) values[key] = it.take(120) }) }
        Field(tr("loyalty.note"), values.getValue("note"), { if (!locked) values["note"] = it.take(2000) }, multiline = true)
        MutationStatus(mutation)
        if (!locked) Action(tr("common.save"), !mutation.busy && fields.all { validCount(values.getValue(it), if (it.startsWith("revenue")) 2_000_000_000 else 1_000_000) } && values.getValue("personInCharge").isNotBlank() && values.getValue("accountablePerson").isNotBlank() && fields.filter { it.startsWith("revenue") }.sumOf { values.getValue(it).toLongOrNull() ?: 0L } + recap.number("revenueFdc").toLong() <= 2_000_000_000L) {
            mutation.run { api.request("POST", "/api/admin/loyalty/recaps", JsonObject(body("eventId" to eventId, "personInCharge" to values.getValue("personInCharge"), "accountablePerson" to values.getValue("accountablePerson"), "note" to values.getValue("note"), "fdcCount" to recap.number("fdcCount"), "revenueFdc" to recap.number("revenueFdc")) + fields.associateWith { JsonPrimitive(values.getValue(it).toInt()) })); reload() }
        }
    }
}
@Composable fun LegacyReport(api: Api, report: JsonObject) {
    var receipt by remember { mutableStateOf("") }; val mutation = rememberMutation()
    Tile {
        Text(report.obj("member").text("fullName")); Text(report.obj("event").text("title")); Text(tr("loyalty." + report.text("status"))); Text(count(report.number("guestCount")) + " · " + tr("loyalty.guestCount")); Text(report.text("notes"))
        if (report["receiptAmount"] != JsonNull) Text(money(report.number("receiptAmount")))
        if (report.text("receiptUrl").isNotBlank()) Action(tr("loyalty.viewReceipt"), !mutation.busy, true) { mutation.run { receipt = api.request("GET", "/api/loyalty/receipts/${report.text("id")}?format=json").text("url") } }
        if (receipt.isNotBlank()) NetworkImage(api, receipt)
        report.rows("guests").forEach { Text(it.text("name") + " · " + it.text("phone")) }
        if (report.text("bonusKind").isNotBlank()) Text(if (report.text("bonusKind") == "CASH") money(report.number("bonusValue")) else count(report.number("bonusValue")) + " XP")
        report.rows("payouts").forEach { Text(money(it.number("amount")) + " · " + tr("loyalty." + it.text("status"))) }
        MutationStatus(mutation)
    }
}
