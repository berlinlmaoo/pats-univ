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
    return if (memberId.isBlank()) emptyList() else rows.filter { it.text("memberId", it.obj("member").text("id")) == memberId }
}

fun reservationMinimumCharge(options: JsonObject, slot: JsonObject?): Int? =
    (slot?.get("minimumCharge") as? JsonPrimitive)?.intOrNull
        ?: (options["venueMinimumCharge"] as? JsonPrimitive)?.intOrNull

fun validReservationDeposit(value: String) = value.toIntOrNull()?.let { it in 1..2_000_000_000 } == true

fun reservationEventId(reservation: JsonObject) = reservation.text("eventId", reservation.obj("event").text("id"))
fun reservationConversationId(reservation: JsonObject) = reservation.text("conversationId", reservation.obj("conversation").text("id"))
fun reservationOperationsPath(eventId: String = "") = "/api/social/operations" + if(eventId.isBlank()) "" else "?eventId=${query(eventId)}"
fun canRecordReservationDeposit(session: Session, reservation: JsonObject, adminMode: Boolean): Boolean =
    adminMode && hasCapability(session, "reservation.manage") && reservation.flag("canRecordDeposit") &&
        reservation.text("status") in setOf("PENDING", "CONFIRMED") && !reservation.obj("payment").flag("paid")

fun reservationPosterEvent(reservation: JsonObject): JsonObject {
    val event = reservation.obj("event")
    val poster = reservation.obj("poster").ifEmpty { event.obj("poster") }
    return JsonObject(event + body("id" to reservationEventId(reservation), "flyerUrl" to poster.text("url"), "description" to poster.text("description"), "poster" to poster))
}

fun blockingReservationRoute(params: Map<String, String>): String? = when {
    !params["conversationId"].isNullOrBlank() -> "conversation/" + params.getValue("conversationId")
    !params["reservationId"].isNullOrBlank() && !params["eventId"].isNullOrBlank() -> "booking/" + params.getValue("eventId") + "/" + params.getValue("reservationId")
    !params["reservationId"].isNullOrBlank() -> "booking/" + params.getValue("reservationId")
    else -> null
}

fun roamingOptionAvailable(data: JsonObject, option: JsonObject, chosenEventId: String): Boolean =
    chosenEventId.isNotBlank() && data.obj("event").text("id") == chosenEventId && option.flag("available")

fun roamingRequestPayload(eventId: String, type: String) = body("eventId" to eventId, "originEventId" to eventId, "type" to type)

fun socialAccessRoute(request: JsonObject): String? = when(request.text("type")) {
    "SOCIAL_HUB" -> request.text("targetCityId").takeIf { it.isNotBlank() }?.let { "hub-access/$it" }
    "ATTENDANCE" -> request.text("eventId").takeIf { it.isNotBlank() }?.let { "event-roaming/$it" }
    else -> null
}

suspend fun resolveSocialAccessRoute(api: Api, requestId: String, eventId: String = ""): String? {
    val data = api.request("GET", reservationOperationsPath(eventId))
    return data.rows("roaming").find { it.text("id") == requestId }?.let(::socialAccessRoute)
}

@Composable fun SocialAccessReview(session: Session, api: Api, requestId: String, language: String, go: (String) -> Unit, eventId: String = "") {
    if(!LocalAdminMode.current || !hasCapability(session, "city.operations")) { Notice(tr("uxSocial.adminRequired")); return }
    Remote(api, reservationOperationsPath(eventId)) { data, _ ->
        val request = data.rows("roaming").find { it.text("id") == requestId }
        val route = request?.let(::socialAccessRoute)
        if(request == null || route == null) Notice(tr("uxSocial.requestUnavailable"))
        else {
            Text(request.obj("event").text("title"), style = MaterialTheme.typography.titleMedium)
            Text(tr(if(request.text("type") == "SOCIAL_HUB") "uxSocial.hubAccess" else "uxSocial.eventAccess"))
            if(request.text("type") == "SOCIAL_HUB" && !hasCapability(session, "hq.manage")) Notice(tr("uxSocial.adminRequired"))
            else Action(tr("uxSocial.openAccessQueue"), secondary = true) { go(route) }
        }
    }
}

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
        Choices(tr("social.event"), events.map { it.text("id") to (it.obj("city").text("name") + " · " + it.text("title")) }, eventId) { eventId = it }
        if (eventId.isBlank()) {
            if (events.isEmpty()) Empty(tr("uxSocial.noOtherCityEvents"), tr("uxSocial.noOtherCityEventsBody"))
            else Notice(tr("uxSocial.chooseVisitEvent"))
        }
    }
    // Even a home-city, ended or unavailable explicit event is checked as itself, never substituted.
    if (eventId.isNotBlank()) key(eventId) {
      Remote(api, "/api/social/roaming-options?eventId=${query(eventId)}", refresh = version) { options, reload ->
        val event = options.obj("event")
        Text(event.text("title"), style = MaterialTheme.typography.titleLarge)
        Text(event.obj("city").text("name"))
        options.rows("options").forEach { option -> key(option.text("type")) { Tile {
            val community = option.text("type") == "SOCIAL_HUB"
            Text(tr(if(community) "uxSocial.hubAccess" else "uxSocial.eventAccess"), style = MaterialTheme.typography.titleMedium)
            Text(tr(if(community) "uxSocial.hubAccessBody" else "uxSocial.eventAccessBody"))
            Text(tr(if(option.text("approver") == "HQ") "uxSocial.hqApprover" else "uxSocial.cityApprover", "city" to event.obj("city").text("name")))
            if (community) Text(tr("uxSocial.hubExpiryHours", "hours" to count(options.number("hubAccessHours"))))
            val existing = option.obj("existing")
            if (existing.isNotEmpty()) {
                Badge(tr("social." + existing.text("status")), existing.text("status"))
                if(existing.text("accessExpiresAt").isNotBlank()) Text(tr("social.expires", "date" to dateTime(existing.text("accessExpiresAt"), LocalLanguage.current)))
            }
            val reason = option.text("reason")
            val reasonKey = when(reason) { "homeCity" -> "uxSocial.reasonHomeCity"; "eventEnded" -> "uxSocial.reasonEventEnded"; "requestExists" -> "uxSocial.reasonRequestExists"; "monthlyLimit" -> "uxSocial.reasonMonthlyLimit"; else -> "uxSocial.visitEventUnavailable" }
            if(reason.isNotBlank()) Notice(tr(reasonKey))
            Action(tr(if(community) "uxSocial.requestHubAccess" else "uxSocial.requestEventAccess"), !mutation.busy && roamingOptionAvailable(options, option, eventId), community) {
                val chosenId = eventId
                mutation.run {
                    api.request("POST", "/api/social/roaming", roamingRequestPayload(chosenId, option.text("type")))
                    mutation.notice = "uxSocial.requestPending"; version++; reload()
                }
            }
        } } }
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
    if(mutation.failure != "errors.reservationLimit") MutationStatus(mutation)
    if (mutation.failure == "errors.reservationLimit") {
        val blocking = mutation.failureArgs.toMap()
        Notice(tr("uxSocial.blockedReservation", "event" to blocking["event"].orEmpty()))
        blockingReservationRoute(blocking)?.let { destination -> Action(tr("uxSocial.openBlocking"), secondary = true) { go(destination) } }
    }
    Remote(api, "/api/social/slots?eventId=${query(eventId)}") { data, reload ->
      Remote(api, "/api/events/${query(eventId)}") { eventData, _ ->
        val event = eventData.obj("event")
        Text(data.text("eventTitle", event.text("title")), style = MaterialTheme.typography.titleLarge)
        Text(data.text("venueName", event.obj("venue").text("name")))
        val approvedPoster = data.obj("poster")
        val reservationEvent = JsonObject(event + body("poster" to approvedPoster, "flyerUrl" to approvedPoster.text("url"), "description" to approvedPoster.text("description")))
        if (event.isNotEmpty()) EventPoster(api, reservationEvent)
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
        val reservation = reservations.find { reservationConversationId(it) == conversationId }
        if (reservation != null) { ReservationSummary(session, api, reservation, language); content() }
        else Notice(tr("uxSocial.bookingUnavailable"))
    }
}

@Composable fun ReservationSummary(session: Session, api: Api, reservation: JsonObject, language: String) {
    val event = reservation.obj("event")
    var eventZone by remember(reservationEventId(reservation)) { mutableStateOf(event.obj("timing").text("timezone", event.obj("city").text("timezone")).takeIf { it.isNotBlank() }) }
    Tile {
        Text(event.text("title") + " · " + reservation.text("slotCode"), style = MaterialTheme.typography.titleMedium)
        ReservationEventContext(session, reservation, language, api) { eventZone = it }
        val kind = reservation.text("slotKind", "OTHER")
        Text(tr("uxSocial.kind.$kind"))
        Text(tr("social." + reservation.text("status")))
        if (reservation.text("status") == "PENDING") Notice(tr("uxSocial.pendingReservation"))
        Detail(tr("social.pax"), count(reservation.number("pax")))
        Detail(tr("phase5.minimumCharge"), money(reservation.number("minimumCharge")))
        if (reservation.text("note").isNotBlank()) Detail(tr("social.note"), reservation.text("note"))
        DepositStatus(reservation, language, eventZone)
    }
}

@Composable private fun ReservationEventContext(session: Session, reservation: JsonObject, language: String, api: Api, onZone: (String) -> Unit) {
    // Both operations and the event reservation endpoint supply approved nested poster data.
    val event = reservationPosterEvent(reservation)
    EventPoster(api, event)
    val venue = reservation.text("venueName", reservation.obj("venue").text("name"))
    if(venue.isNotBlank()) Detail(tr("uxSocial.venue"), venue)
    if(event.obj("city").text("timezone").isNotBlank()) ReservationEventTiming(event, language, onZone)
    else if(reservationEventId(reservation).isNotBlank()) {
        // The operations card has startsAt but omits its zone; use authorized metadata rather than guess WIB.
        val prefix = if(hasPersonalMembership(session)) "/api/events/" else "/api/admin/events/"
        Remote(api, prefix + query(reservationEventId(reservation))) { data, _ -> ReservationEventTiming(data.obj("event"), language, onZone) }
    }
}

@Composable private fun ReservationEventTiming(event: JsonObject, language: String, onZone: (String) -> Unit) {
    val city = event.obj("city").text("name")
    if(city.isNotBlank()) Text(city)
    val zone = event.obj("timing").text("timezone", event.obj("city").text("timezone", "Asia/Jakarta"))
    SideEffect { onZone(zone) }
    if(event.text("startsAt").isNotBlank()) Detail(tr("uxSocial.starts"), dateTime(event.text("startsAt"), language, zone))
}

@Composable fun DepositStatus(reservation: JsonObject, language: String, zone: String? = null) {
    Text(tr("uxSocial.deposit"), style = MaterialTheme.typography.titleMedium)
    val payment = reservation.obj("payment")
    if (payment.flag("paid")) {
        val amount = (payment["amount"] as? JsonPrimitive)?.intOrNull
        Detail(tr("uxSocial.depositRecorded"), amount?.let(::money) ?: tr("uxSocial.amountUnavailable"))
        if(payment.text("paidAt").isNotBlank()) Text(if(zone == null) tr("uxSocial.paymentTimePending") else dateTime(payment.text("paidAt"), language, zone))
        val recorder = payment.text("recordedBy")
        if (recorder.isNotBlank()) Text(tr("uxSocial.recordedBy", "name" to recorder))
    } else {
        Notice(tr("uxSocial.depositNotRecorded"))
        Text(tr("uxSocial.depositOffApp"))
    }
    if(payment.flag("blocksNewBookings")) Notice(tr("uxSocial.paymentBlocksBookings"))
}

@Composable private fun RecordReservationDeposit(session: Session, api: Api, reservation: JsonObject, saved: (JsonObject) -> Unit) {
    if (!canRecordReservationDeposit(session, reservation, LocalAdminMode.current)) return
    var open by remember(reservation.text("id")) { mutableStateOf(false) }
    var amount by rememberSaveable(reservation.text("id")) { mutableStateOf("") }
    val mutation = rememberMutation()
    Action(tr("uxSocial.recordDeposit"), !mutation.busy, true) { open = !open }
    if (open) Tile {
        Text(tr("uxSocial.recordDepositBody"))
        Field(tr("uxSocial.depositAmount"), amount, { amount = it }, KeyboardType.Number, moneyInput = true)
        Decide(tr("uxSocial.recordDeposit"), tr("uxSocial.recordDepositConfirm", "amount" to (amount.toIntOrNull()?.let(::money) ?: ""), "event" to reservation.obj("event").text("title"), "slot" to reservation.text("slotCode"), "member" to reservation.obj("member").text("fullName")), validReservationDeposit(amount) && !mutation.busy, true) {
            mutation.run {
                val response = api.request("POST", "/api/admin/reservations/${query(reservation.text("id"))}/payment", body("amount" to amount.toInt()))
                amount = ""; open = false; saved(response.obj("reservation"))
            }
        }
    }
    MutationStatus(mutation)
}

/** Separate member utilities and staff queues; each route has one purpose and owner. */
@Composable fun SocialOperations(session: Session, api: Api, language: String, go: (String) -> Unit, mode: String = "my-reservations", eventId: String = "", cityId: String = "", reservationId: String = "") {
    val staff = LocalAdminMode.current && hasCapability(session, "city.operations")
    val staffRoute = mode in setOf("reservations", "attendance-access", "hub-access", "moderation")
    if (staffRoute && (!staff || (mode == "hub-access" && !hasCapability(session, "hq.manage")))) { Notice(tr("uxSocial.adminRequired")); return }
    val key = when(mode) { "reservations" -> "reservationQueue"; "attendance-access" -> "eventAccessQueue"; "hub-access" -> "hubAccessQueue"; "moderation" -> "moderation"; "my-access" -> "myAccess"; else -> "myReservations" }
    if (eventId.isBlank() || !staffRoute) Title(tr("uxSocial.$key")) else Text(tr("uxSocial.$key"), style = MaterialTheme.typography.titleLarge)
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
    var paymentUpdates by remember(mode, eventId, scopeCity) { mutableStateOf<Map<String, JsonObject>>(emptyMap()) }
    var tab by rememberSaveable(mode, eventId) { mutableStateOf(if(staffRoute) "pending" else "active") }
    Remote(api, reservationOperationsPath(eventId), pollMs = 15000) { data, reload ->
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
                // The server aggregate includes both access types; each focused queue counts its own type.
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
                val refreshed = data.rows("reservations").map { row ->
                    val update = paymentUpdates[row.text("id")]
                    if(update != null && update.text("updatedAt") > row.text("updatedAt")) JsonObject(row + update + body("canRecordDeposit" to false)) else row
                }
                val source = if(staffRoute) refreshed else ownSocialRows(refreshed, session)
                val rows = source.filter { (eventId.isBlank() || reservationEventId(it) == eventId) && (!staffRoute || eventId.isNotBlank() || it.obj("event").text("cityId", it.obj("event").obj("city").text("id")) == scopeCity) }
                val authoritativeCounts = staffRoute && eventId.isNotBlank() && data.obj("counts").isNotEmpty()
                val pending = if(authoritativeCounts) data.obj("counts").number("reservationsPending") else rows.count { it.text("status") == "PENDING" }
                val deposits = if(authoritativeCounts && paymentUpdates.isEmpty()) data.obj("counts").number("depositsUnpaid") else rows.count { it.obj("payment").flag("blocksNewBookings") }
                if(staffRoute) Text(tr("uxSocial.unpaidDeposits", "count" to count(deposits)))
                val tabs = if(staffRoute) listOf("pending" to (tr("uxSocial.pending") + " · " + count(pending)), "confirmed" to tr("social.CONFIRMED"), "history" to tr("uxSocial.history")) else listOf("active" to tr("uxSocial.active"), "history" to tr("uxSocial.history"))
                if(reservationId.isBlank()) Tabs(tabs, tab) { tab = it }
                val visible = rows.filter { if(reservationId.isNotBlank()) it.text("id") == reservationId else when(tab) { "pending" -> it.text("status") == "PENDING"; "confirmed" -> it.text("status") == "CONFIRMED"; "history" -> it.text("status") !in setOf("PENDING", "CONFIRMED"); else -> it.text("status") in setOf("PENDING", "CONFIRMED") } }
                if (visible.isEmpty()) Empty(tr("social.noRequests"), tr("uxSocial.noReservationsBody"))
                visible.forEach { reservation -> key(reservation.text("id")) {
                    ReservationSummary(session, api, reservation, language)
                    if (staffRoute) Text(reservation.obj("member").text("fullName"), style = MaterialTheme.typography.titleMedium)
                    if (reservationConversationId(reservation).isNotBlank()) Action(tr("uxSocial.crewChat"), secondary = true) { go("conversation/" + reservationConversationId(reservation)) }
                    if (staffRoute && reservation.flag("canDecide") && reservation.text("status") == "PENDING") listOf("CONFIRMED" to "social.confirm", "REJECTED" to "social.reject").forEach { (status, label) ->
                        Decide(tr(label), tr("uxSocial.reservationDecision", "event" to reservation.obj("event").text("title"), "slot" to reservation.text("slotCode"), "name" to reservation.obj("member").text("fullName")), !mutation.busy, true) { decide("reservation-decision", body("id" to reservation.text("id"), "status" to status)) }
                    }
                    if ((!staffRoute || reservation.flag("canDecide")) && reservation.text("status") in setOf("PENDING", "CONFIRMED")) Decide(tr("social.cancelReservation"), tr("uxSocial.cancelReservationBody", "event" to reservation.obj("event").text("title"), "slot" to reservation.text("slotCode")), !mutation.busy, true) { decide("reservation-decision", body("id" to reservation.text("id"), "status" to "CANCELLED")) }
                    if (staffRoute) RecordReservationDeposit(session, api, reservation) { updated ->
                        if(updated.isNotEmpty()) paymentUpdates = paymentUpdates + (reservation.text("id") to updated)
                        reload()
                    }
                } }
            }
        }
    }
}
