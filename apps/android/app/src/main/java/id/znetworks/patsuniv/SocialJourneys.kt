package id.znetworks.patsuniv

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import kotlinx.serialization.json.*

/** An explicit event selection is never replaced with the first event returned by the API. */
fun selectedVisitEvent(events: List<JsonObject>, selectedId: String): JsonObject? =
    events.firstOrNull { it.text("id") == selectedId }

fun ownSocialRows(rows: List<JsonObject>, session: Session): List<JsonObject> {
    val memberId = session.me.obj("member").text("id")
    return if (memberId.isBlank()) emptyList() else rows.filter { it.text("memberId") == memberId }
}

fun reservationMinimumCharge(options: JsonObject, slot: JsonObject?): Int? =
    (slot?.get("minimumCharge") as? JsonPrimitive)?.intOrNull
        ?: (options["minimumCharge"] as? JsonPrimitive)?.intOrNull

fun validReservationDeposit(value: String) = value.toIntOrNull()?.let { it in 1..2_000_000_000 } == true

@Composable fun Roaming(session: Session, api: Api, initial: String, go: (String) -> Unit) {
    Title(tr("uxSocial.visitCity"), tr("uxSocial.visitCityBody"))
    if (session.me.obj("member").isEmpty()) { Notice(tr("uxSocial.membershipRequired")); return }
    var eventId by rememberSaveable(initial) { mutableStateOf(initial) }
    var version by remember { mutableIntStateOf(0) }
    val mutation = rememberMutation()
    MutationStatus(mutation)
    Remote(api, "/api/events?scope=all") { data, _ ->
        val homeId = session.me.obj("member").obj("city").text("id")
        val events = data.rows("upcoming").filter { it.obj("city").text("id") != homeId }
        val selected = selectedVisitEvent(events, eventId)
        Choices(tr("social.event"), events.map { it.text("id") to (it.obj("city").text("name") + " · " + it.text("title")) }, eventId) { eventId = it }
        if (events.isEmpty()) Empty(tr("uxSocial.noOtherCityEvents"), tr("uxSocial.noOtherCityEventsBody"))
        else if (selected == null) Notice(tr(if(eventId.isBlank()) "uxSocial.chooseVisitEvent" else "uxSocial.visitEventUnavailable"), eventId.isNotBlank())
        selected?.let { chosen ->
            Tile {
                Text(chosen.text("title"), style = MaterialTheme.typography.titleMedium)
                Text(chosen.obj("city").text("name"))
                Text(tr("uxSocial.eventAccess"), style = MaterialTheme.typography.titleMedium)
                Text(tr("uxSocial.eventAccessBody"))
                Action(tr("uxSocial.requestEventAccess"), !mutation.busy) {
                    mutation.run { api.request("POST", "/api/social/roaming", body("eventId" to chosen.text("id"), "type" to "ATTENDANCE")); mutation.notice = "uxSocial.requestPending"; version++ }
                }
            }
            Tile {
                Text(tr("uxSocial.hubAccess"), style = MaterialTheme.typography.titleMedium)
                Text(tr("uxSocial.hubAccessBody"))
                Action(tr("uxSocial.requestHubAccess"), !mutation.busy, true) {
                    mutation.run { api.request("POST", "/api/social/roaming", body("eventId" to chosen.text("id"), "type" to "SOCIAL_HUB")); mutation.notice = "uxSocial.requestPending"; version++ }
                }
            }
        }
    }
    key(version) { SocialOperations(session, api, LocalLanguage.current, go, mode = "my-access") }
}

@Composable fun Reservation(api: Api, eventId: String, go: (String) -> Unit) {
    Title(tr("uxSocial.reservation"), tr("social.floorHint"))
    var slot by rememberSaveable(eventId) { mutableStateOf("") }
    var pax by rememberSaveable(eventId) { mutableStateOf("1") }
    var note by rememberSaveable(eventId) { mutableStateOf("") }
    var review by rememberSaveable(eventId) { mutableStateOf(false) }
    val mutation = rememberMutation()
    MutationStatus(mutation)
    if (mutation.failure == "errors.reservationLimit") Notice(tr("uxSocial.unpaidBlock"))
    Remote(api, "/api/social/slots?eventId=${query(eventId)}") { data, reload ->
      Remote(api, "/api/events/${query(eventId)}") { eventData, _ ->
        val event = eventData.obj("event")
        Text(data.text("eventTitle", event.text("title")), style = MaterialTheme.typography.titleLarge)
        Text(data.text("venueName", event.obj("venue").text("name")))
        if (event.isNotEmpty()) EventPoster(api, event)
        val slots = data.rows("slots")
        val taken = (data["taken"] as? JsonArray)?.map { it.jsonPrimitive.content }.orEmpty()
        val selected = slots.find { it.text("code") == slot }
        val minimumCharge = reservationMinimumCharge(data, selected)
        val valid = selected != null && slot !in taken && pax.toIntOrNull()?.let { it in 1..selected.number("pax").coerceAtMost(100) } == true
        if (slots.isEmpty()) Empty(tr("social.noSlots"), tr("social.noSlotsBody"))
        else if (!review) {
            BoxWithConstraints(Modifier.fillMaxWidth().aspectRatio(1f).background(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.large)) {
                val unit = maxWidth / 12
                slots.forEach { s ->
                    val unavailable = s.text("code") in taken
                    Surface(Modifier.offset(unit * s.number("x"), unit * s.number("y")).size(unit * s.number("w"), unit * s.number("h")).padding(Space.tiny / 2).clickable(enabled = !unavailable) { slot = s.text("code"); pax = "1" }, color = if (slot == s.text("code")) MaterialTheme.colorScheme.primary else if (unavailable) MaterialTheme.colorScheme.outlineVariant else MaterialTheme.colorScheme.surface, shape = MaterialTheme.shapes.small) {
                        Box(contentAlignment = Alignment.Center) { Text(s.text("code"), style = MaterialTheme.typography.labelSmall, maxLines = 1, softWrap = false) }
                    }
                }
            }
            Choices(tr("social.slot"), slots.filter { it.text("code") !in taken }.map { it.text("code") to (it.text("code") + " · " + tr("social." + it.text("kind")) + " · " + count(it.number("pax"))) }, slot) { slot = it }
            selected?.let {
                Text(tr("social.minimumSpend") + ": " + it.text("minimumSpend"))
                Detail(tr("phase5.minimumCharge"), minimumCharge?.let(::money) ?: tr("uxSocial.minimumChargePending"))
            }
            Field(tr("social.pax"), pax, { pax = it }, KeyboardType.Number)
            Field(tr("social.note"), note, { note = it.take(4000) }, multiline = true)
            Action(tr("uxSocial.reviewReservation"), valid && !mutation.busy) { review = true }
        } else {
            Tile {
                Text(tr("uxSocial.reviewReservation"), style = MaterialTheme.typography.titleLarge)
                Detail(tr("social.event"), data.text("eventTitle", event.text("title")))
                if (event.text("startsAt").isNotBlank()) Detail(tr("uxSocial.starts"), dateTime(event.text("startsAt"), LocalLanguage.current, event.obj("city").text("timezone", "Asia/Jakarta")))
                Detail(tr("uxSocial.venue"), data.text("venueName", event.obj("venue").text("name")))
                Detail(tr("social.slot"), slot + " · " + tr("social." + (selected?.text("kind") ?: "TABLE")))
                Detail(tr("social.pax"), pax)
                Detail(tr("phase5.minimumCharge"), minimumCharge?.let(::money) ?: tr("uxSocial.minimumChargePending"))
                if (note.isNotBlank()) Detail(tr("social.note"), note)
                Notice(tr("uxSocial.reservationTerms"))
                Text(tr("uxSocial.depositTerms"))
                if (!valid) Notice(tr("uxSocial.slotUnavailable"), true)
                Action(tr("uxSocial.sendReservation"), valid && !mutation.busy) {
                    mutation.run {
                        try {
                            val result = api.request("POST", "/api/social/reserve", body("eventId" to eventId, "slotCode" to slot, "pax" to pax.toInt(), "note" to note))
                            go("conversation/" + result.text("conversationId"))
                        } finally { reload() }
                    }
                }
                Action(tr("uxSocial.editReservation"), !mutation.busy, true) { review = false }
            }
        }
      }
    }
    Action(tr("uxSocial.myReservations"), secondary = true) { go("social-operations") }
}

@Composable fun ReservationConversationSummary(session: Session, api: Api, conversationId: String, language: String, content: @Composable () -> Unit = {}) {
    Remote(api, "/api/social/operations", pollMs = 15000) { data, _ ->
        val staff = LocalAdminMode.current && hasCapability(session, "city.operations")
        val reservations = if (staff) data.rows("reservations") else ownSocialRows(data.rows("reservations"), session)
        val reservation = reservations.find { it.obj("conversation").text("id") == conversationId }
        if (reservation != null) { ReservationSummary(session, api, reservation, language); content() }
        else Notice(tr("uxSocial.bookingUnavailable"))
    }
}

@Composable fun ReservationSummary(session: Session, api: Api, reservation: JsonObject, language: String) {
    val event = reservation.obj("event")
    Tile {
        Text(event.text("title") + " · " + reservation.text("slotCode"), style = MaterialTheme.typography.titleMedium)
        ReservationEventContext(session, api, reservation, language)
        Text(tr("social." + reservation.text("status")))
        if (reservation.text("status") == "PENDING") Notice(tr("uxSocial.pendingReservation"))
        Detail(tr("social.pax"), count(reservation.number("pax")))
        Detail(tr("phase5.minimumCharge"), money(reservation.number("minimumCharge")))
        if (reservation.text("note").isNotBlank()) Detail(tr("social.note"), reservation.text("note"))
        DepositStatus(reservation, language)
    }
}

@Composable private fun ReservationEventContext(session: Session, api: Api, reservation: JsonObject, language: String) {
    val eventId = reservation.text("eventId", reservation.obj("event").text("id"))
    if (eventId.isBlank()) return
    // Consume the authorized event summary, never raw pending poster/description submissions.
    val path = if (hasCapability(session, "city.operations")) "/api/admin/events/" else "/api/events/"
    Remote(api, path + query(eventId)) { data, _ ->
        val event = data.obj("event")
        EventPoster(api, event)
        Text(event.obj("city").text("name") + " · " + event.obj("venue").text("name"))
        if (event.text("startsAt").isNotBlank()) Detail(tr("uxSocial.starts"), dateTime(event.text("startsAt"), language, event.obj("city").text("timezone", "Asia/Jakarta")))
    }
}

@Composable fun DepositStatus(reservation: JsonObject, language: String) {
    Text(tr("uxSocial.deposit"), style = MaterialTheme.typography.titleMedium)
    if (reservation.text("downPaymentAt").isNotBlank()) {
        val amount = (reservation["downPaymentAmount"] as? JsonPrimitive)?.intOrNull
        Detail(tr("uxSocial.depositRecorded"), amount?.let(::money) ?: tr("uxSocial.amountUnavailable"))
        Text(dateTime(reservation.text("downPaymentAt"), language))
        val recorder = reservation.obj("downPaymentBy").text("name")
        if (recorder.isNotBlank()) Text(tr("uxSocial.recordedBy", "name" to recorder))
        else if (reservation.text("downPaymentById").isNotBlank()) Text(tr("uxSocial.recordedByCrew"))
    } else {
        Notice(tr("uxSocial.depositNotRecorded"))
        Text(tr("uxSocial.depositTerms"))
    }
}

@Composable private fun RecordReservationDeposit(session: Session, api: Api, reservation: JsonObject, saved: () -> Unit) {
    if (!LocalAdminMode.current || !hasCapability(session, "reservation.manage") || reservation.text("status") != "CONFIRMED" || reservation.text("downPaymentAt").isNotBlank()) return
    var open by remember(reservation.text("id")) { mutableStateOf(false) }
    var amount by rememberSaveable(reservation.text("id")) { mutableStateOf("") }
    val mutation = rememberMutation()
    Action(tr("uxSocial.recordDeposit"), !mutation.busy, true) { open = !open }
    if (open) Tile {
        Text(tr("uxSocial.recordDepositBody"))
        Field(tr("uxSocial.depositAmount"), amount, { amount = it }, KeyboardType.Number, moneyInput = true)
        Decide(tr("uxSocial.recordDeposit"), tr("uxSocial.recordDepositConfirm", "amount" to (amount.toIntOrNull()?.let(::money) ?: ""), "event" to reservation.obj("event").text("title"), "slot" to reservation.text("slotCode")), validReservationDeposit(amount) && !mutation.busy, true) {
            mutation.run {
                api.request("POST", "/api/admin/payments", body("kind" to "reservation", "id" to reservation.text("id"), "amount" to amount.toInt()))
                amount = ""; open = false; saved()
            }
        }
    }
    MutationStatus(mutation)
}

/** Separate member utilities and staff queues; each route has one purpose and owner. */
@Composable fun SocialOperations(session: Session, api: Api, language: String, go: (String) -> Unit, mode: String = "my-reservations", eventId: String = "", cityId: String = "") {
    val staff = LocalAdminMode.current && hasCapability(session, "city.operations")
    val staffRoute = mode in setOf("reservations", "attendance-access", "hub-access", "moderation")
    if (staffRoute && (!staff || (mode == "hub-access" && !hasCapability(session, "hq.manage")))) { Notice(tr("uxSocial.adminRequired")); return }
    val key = when(mode) { "reservations" -> "reservationQueue"; "attendance-access" -> "eventAccessQueue"; "hub-access" -> "hubAccessQueue"; "moderation" -> "moderation"; "my-access" -> "myAccess"; else -> "myReservations" }
    if (eventId.isBlank()) Title(tr("uxSocial.$key")) else Text(tr("uxSocial.$key"), style = MaterialTheme.typography.titleLarge)
    if (!staffRoute && session.me.obj("member").isEmpty()) { Notice(tr("uxSocial.membershipRequired")); return }
    var scopeCity by rememberSaveable(mode, cityId) { mutableStateOf(cityId.ifBlank { session.me.obj("user").obj("city").text("id", session.me.obj("user").text("cityId")) }) }
    if (staffRoute && eventId.isBlank()) Remote(api, "/api/social/hub") { hub, _ ->
        val cities = hub.rows("cities")
        if (hasCapability(session, "hq.manage")) Choices(tr("uxSocial.operatingCity"), cities.map { it.text("id") to it.text("name") }, scopeCity) { scopeCity = it }
        else Text(cities.find { it.text("id") == scopeCity }?.text("name").orEmpty())
    }
    if (staffRoute && eventId.isBlank() && scopeCity.isBlank()) { Notice(tr("uxSocial.chooseOperatingCity")); return }
    val mutation = rememberMutation()
    MutationStatus(mutation)
    var tab by rememberSaveable(mode, eventId) { mutableStateOf(if(staffRoute) "pending" else "active") }
    Remote(api, "/api/social/operations", pollMs = 15000) { data, reload ->
        fun decide(path: String, payload: JsonObject) { mutation.run { api.request("POST", "/api/social/$path", payload); reload() } }
        when(mode) {
            "moderation" -> {
                Tabs(listOf("pending" to tr("social.muted"), "history" to tr("social.screenshots")), tab) { tab = it }
                if (tab == "pending") {
                    Text(tr("uxSocial.mutedBody"))
                    val muted = data.rows("muted").filter { it.text("cityId") == scopeCity }
                    if (muted.isEmpty()) Empty(tr("social.noMuted"), tr("uxSocial.noModerationWork"))
                    muted.forEach { member -> key(member.text("cityId"), member.text("userId")) { Tile {
                        Text(member.text("name"))
                        Decide(tr("social.unmute"), tr("uxSocial.unmuteBody", "name" to member.text("name")), !mutation.busy, true) { decide("moderate", body("action" to "mute", "cityId" to member.text("cityId"), "userId" to member.text("userId"), "muted" to false)) }
                    } } }
                } else {
                    Text(tr("uxSocial.screenshotHistoryBody"))
                    if (data.rows("screenshots").isEmpty()) Notice(tr("social.noScreenshots"))
                    data.rows("screenshots").forEach { Text(it.text("name") + " · " + count(it.number("count"))) }
                }
            }
            "attendance-access", "hub-access", "my-access" -> {
                val source = if(staffRoute) data.rows("roaming") else ownSocialRows(data.rows("roaming"), session)
                val requestType = if(mode == "hub-access") "SOCIAL_HUB" else "ATTENDANCE"
                val rows = source.filter { (eventId.isBlank() || it.text("eventId") == eventId) && (!staffRoute || eventId.isNotBlank() || it.text("targetCityId") == scopeCity) && (mode == "my-access" || it.text("type") == requestType) }
                val pending = rows.count { it.text("status") == "PENDING" }
                Tabs(listOf((if(staffRoute) "pending" else "active") to (tr(if(staffRoute) "uxSocial.pending" else "uxSocial.active") + " · " + count(if(staffRoute) pending else rows.count { it.text("status") in setOf("PENDING", "APPROVED") })), "history" to tr("uxSocial.history")), tab) { tab = it }
                val activeStatuses = if(staffRoute) setOf("PENDING") else setOf("PENDING", "APPROVED")
                val visible = rows.filter { if(tab == "history") it.text("status") !in activeStatuses else it.text("status") in activeStatuses }
                if (visible.isEmpty()) Empty(tr("social.noRequests"), tr("uxSocial.noQueueItems"))
                visible.forEach { request -> key(request.text("id")) { Tile {
                    Text(request.obj("event").text("title"), style = MaterialTheme.typography.titleMedium)
                    if (staffRoute) Text(request.obj("member").text("fullName"))
                    Text(tr(if(request.text("type") == "SOCIAL_HUB") "uxSocial.hubAccess" else "uxSocial.eventAccess"))
                    Text(tr("social." + request.text("status")))
                    Text(tr(if(request.text("type") == "SOCIAL_HUB") "uxSocial.hubAccessBody" else "uxSocial.eventAccessBody"))
                    if (request.text("accessExpiresAt").isNotBlank()) Text(tr("social.expires", "date" to dateTime(request.text("accessExpiresAt"), language)))
                    if (staffRoute && request.text("status") == "PENDING") listOf("APPROVED" to "social.approve", "REJECTED" to "social.reject").forEach { (decision, label) ->
                        Decide(tr(label), tr("uxSocial.accessDecision", "name" to request.obj("member").text("fullName"), "event" to request.obj("event").text("title"), "type" to tr(if(request.text("type") == "SOCIAL_HUB") "uxSocial.hubAccess" else "uxSocial.eventAccess")), !mutation.busy, true) { decide("roaming-decision", body("id" to request.text("id"), "decision" to decision)) }
                    }
                } } }
            }
            else -> {
                val source = if(staffRoute) data.rows("reservations") else ownSocialRows(data.rows("reservations"), session)
                val rows = source.filter { (eventId.isBlank() || it.text("eventId") == eventId) && (!staffRoute || eventId.isNotBlank() || it.obj("event").text("cityId", it.obj("event").obj("city").text("id")) == scopeCity) }
                val tabs = if(staffRoute) listOf("pending" to (tr("uxSocial.pending") + " · " + count(rows.count { it.text("status") == "PENDING" })), "confirmed" to tr("social.CONFIRMED"), "history" to tr("uxSocial.history")) else listOf("active" to tr("uxSocial.active"), "history" to tr("uxSocial.history"))
                Tabs(tabs, tab) { tab = it }
                val visible = rows.filter { when(tab) { "pending" -> it.text("status") == "PENDING"; "confirmed" -> it.text("status") == "CONFIRMED"; "history" -> it.text("status") !in setOf("PENDING", "CONFIRMED"); else -> it.text("status") in setOf("PENDING", "CONFIRMED") } }
                if (visible.isEmpty()) Empty(tr("social.noRequests"), tr("uxSocial.noReservationsBody"))
                visible.forEach { reservation -> key(reservation.text("id")) {
                    ReservationSummary(session, api, reservation, language)
                    if (staffRoute) Text(reservation.obj("member").text("fullName"), style = MaterialTheme.typography.titleMedium)
                    if (reservation.obj("conversation").isNotEmpty()) Action(tr("uxSocial.crewChat"), secondary = true) { go("conversation/" + reservation.obj("conversation").text("id")) }
                    if (staffRoute && reservation.flag("canDecide") && reservation.text("status") == "PENDING") listOf("CONFIRMED" to "social.confirm", "REJECTED" to "social.reject").forEach { (status, label) ->
                        Decide(tr(label), tr("uxSocial.reservationDecision", "event" to reservation.obj("event").text("title"), "slot" to reservation.text("slotCode"), "name" to reservation.obj("member").text("fullName")), !mutation.busy, true) { decide("reservation-decision", body("id" to reservation.text("id"), "status" to status)) }
                    }
                    if ((!staffRoute || reservation.flag("canDecide")) && reservation.text("status") in setOf("PENDING", "CONFIRMED")) Decide(tr("social.cancelReservation"), tr("uxSocial.cancelReservationBody", "event" to reservation.obj("event").text("title"), "slot" to reservation.text("slotCode")), !mutation.busy, true) { decide("reservation-decision", body("id" to reservation.text("id"), "status" to "CANCELLED")) }
                    if (staffRoute) RecordReservationDeposit(session, api, reservation, reload)
                } }
            }
        }
    }
}
