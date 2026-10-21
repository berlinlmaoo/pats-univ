package id.znetworks.patsuniv

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject

/** Membership, including a staff member's own profile, is separate from Admin mode. */
fun canParticipateInEvent(session: Session?) = session != null && hasPersonalMembership(session)

fun eventBrowsePath(session: Session?, admin: Boolean, all: Boolean): String =
    if (admin || (session != null && hasCapability(session, "city.operations") && !canParticipateInEvent(session))) "/api/admin/events"
    else "/api/events?scope=" + if (all) "national" else "city"

fun eventZone(event: JsonObject) = event.obj("timing").text("timezone", event.obj("city").text("timezone", "Asia/Jakarta"))
fun eventTime(event: JsonObject, key: String) = event.obj("timing").text(key, event.text(key))
fun eventAction(event: JsonObject, key: String) = event.rows("actions").find { it.text("key") == key } ?: body()
fun canUseEventAction(event: JsonObject, key: String) = eventAction(event, key).flag("available")

fun eventIsOtherCity(session: Session?, event: JsonObject): Boolean {
    if (event["isHomeCity"] is kotlinx.serialization.json.JsonPrimitive) return !event.flag("isHomeCity")
    val city = session?.me?.obj("member")?.obj("city")?.text("id").orEmpty()
    return city.isNotBlank() && event.obj("city").text("id").isNotBlank() && city != event.obj("city").text("id")
}

/** A displayed QR or an ended event alone cannot complete attendance. */
fun canCompleteEventJourney(event: JsonObject) = event.obj("myCheckIn").isNotEmpty() && event.text("phase") == "ended"

fun visibleJourneyStep(journey: List<JsonObject>, selected: String? = null): JsonObject? =
    journey.find { it.text("key") == selected && it.text("state") in setOf("done", "current") }
        ?: journey.find { it.text("state") == "current" } ?: journey.lastOrNull()

fun mayTapJourneyStep(step: JsonObject) = step.text("key") in setOf("event", "poster", "reservation") &&
    step.text("completion") == "tap" && step.text("state") == "current"

@Composable fun EventPoster(api: Api, event: JsonObject) {
    var open by remember(event.text("id")) { mutableStateOf(false) }
    val flyer = event.obj("poster").text("url", event.text("flyerUrl"))
    val description = event.obj("poster").text("description", event.text("description"))
    if (flyer.isNotBlank()) {
        Box(Modifier.fillMaxWidth().clickable(onClickLabel = tr("uxMember.viewPoster")) { open = true }) { NetworkImage(api, flyer) }
    }
    if (flyer.isNotBlank() || description.isNotBlank()) {
        Action(tr("uxMember.viewPoster"), secondary = true) { open = true }
    }
    if (open) Dialog(onDismissRequest = { open = false }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column(Modifier.fillMaxSize().padding(Space.page), verticalArrangement = Arrangement.spacedBy(Space.gap)) {
                Text(event.text("title"), style = MaterialTheme.typography.titleLarge)
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(Space.gap)) {
                    if (flyer.isNotBlank()) FullEventPoster(api, flyer, event.text("title"))
                    Text(description.ifBlank { tr("uxMember.posterDescriptionPending") })
                }
                Action(tr("common.close"), secondary = true) { open = false }
            }
        }
    }
}

@Composable private fun FullEventPoster(api: Api, url: String, title: String) {
    var bitmap by remember(url) { mutableStateOf<android.graphics.Bitmap?>(null) }
    var failed by remember(url) { mutableStateOf(false) }
    LaunchedEffect(url) {
        try {
            val bytes = api.media(url)
            bitmap = withContext(Dispatchers.Default) { decodeMediaBitmap(bytes) }
            failed = bitmap == null
        } catch (e: CancellationException) { throw e } catch (_: Exception) { failed = true }
    }
    bitmap?.let { image -> Image(image.asImageBitmap(), tr("uxMember.posterImage", "event" to title), Modifier.fillMaxWidth().aspectRatio(image.width.toFloat() / image.height.coerceAtLeast(1))) }
    if (bitmap == null && !failed) LoadingSkeleton()
    if (failed) Notice(tr("errors.network"), true)
}

/** Isolated until the owner defines sharing destinations and any award rules. */
@Composable fun PosterShareStep(api: Api, event: JsonObject, enabled: Boolean = true, onContinue: () -> Unit) {
    EventPoster(api, event)
    Notice(tr("uxMember.posterPending"))
    Action(tr("uxMember.sharePoster"), enabled = enabled, onClick = onContinue)
}

@Composable fun EventAttendance(session: Session?, event: JsonObject, go: (String) -> Unit) {
    val zone = eventZone(event)
    SectionLabel(tr("uxMember.yourAttendance"))
    if (!canParticipateInEvent(session)) {
        Notice(tr("uxMember.staffParticipation"))
        Detail(tr("uxMember.checkInOpens"), dateTime(eventTime(event, "checkInOpensAt"), LocalLanguage.current, zone))
        Detail(tr("uxMember.checkInCloses"), dateTime(eventTime(event, "checkInClosesAt"), LocalLanguage.current, zone))
        return
    }
    val checkIn = event.obj("myCheckIn")
    if (checkIn.isNotEmpty()) {
        CheckInStrip(checkIn, LocalLanguage.current, zone)
        Text(tr("uxMember.automaticXp"))
        Action(tr("uxMember.viewXpActivity"), secondary = true) { go("wallet/activity") }
    } else when {
        canUseEventAction(event, "showQr") -> {
            Notice(tr("uxMember.showCrew"))
            Action(tr("uxMember.showQr"), maroon = true) { go("card") }
        }
        event.text("phase") == "ended" -> Notice(tr("uxMember.noAttendance"))
        eventAction(event, "showQr").text("reason").isNotBlank() -> Notice(tr("ux.reason." + eventAction(event, "showQr").text("reason")))
        event.text("phase") == "closed" -> Notice(tr("uxMember.checkInClosed"))
        else -> Notice(tr("uxMember.checkInNotOpen", "time" to dateTime(eventTime(event, "checkInOpensAt"), LocalLanguage.current, zone)))
    }
    Detail(tr("uxMember.checkInOpens"), dateTime(eventTime(event, "checkInOpensAt"), LocalLanguage.current, zone))
    Detail(tr("uxMember.checkInCloses"), dateTime(eventTime(event, "checkInClosesAt"), LocalLanguage.current, zone))
    if (eventIsOtherCity(session, event) && event.text("phase") != "ended") Notice(tr("uxMember.otherCityAdmission"))
}

@Composable fun EventJourney(session: Session, api: Api, event: JsonObject, go: (String) -> Unit, journey: List<JsonObject> = emptyList(), myReservation: JsonObject = body(), reload: () -> Unit = {}) {
    if (!canParticipateInEvent(session)) return
    val eventId = event.text("id")
    var refreshed by remember(eventId) { mutableStateOf<JsonObject?>(null) }
    var selected by remember(eventId) { mutableStateOf<String?>(null) }
    LaunchedEffect(event, journey, myReservation) { refreshed = null }
    val currentEvent = refreshed?.obj("event")?.takeIf { it.isNotEmpty() } ?: event
    val steps = refreshed?.rows("journey") ?: journey
    val reservation = refreshed?.obj("myReservation") ?: myReservation
    val mutation = rememberMutation()
    fun tap(step: JsonObject) {
        if (!mayTapJourneyStep(step)) return
        mutation.run {
            refreshed = api.request("POST", "/api/me/journey", body("eventId" to eventId, "step" to step.text("key")))
            selected = null
            reload()
        }
    }
    SectionLabel(tr("uxMember.yourJourney"))
    MutationStatus(mutation)
    if (steps.isEmpty()) { Notice(tr("uxMember.journeyUnavailable")); Action(tr("uxMember.viewEvent"), secondary = true) { go("event/$eventId") }; return }
    val step = visibleJourneyStep(steps, selected) ?: return
    Column(verticalArrangement = Arrangement.spacedBy(Space.small)) {
        steps.forEachIndexed { index, item ->
            Row(Modifier.fillMaxWidth().clickable(enabled = item.text("state") in setOf("done", "current")) { selected = item.text("key") }, horizontalArrangement = Arrangement.spacedBy(Space.small)) {
                Text((index + 1).toString(), style = MaterialTheme.typography.labelLarge)
                Text(tr("ux.journey." + item.text("key")), Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                if (item.text("state") == "current") Text(tr("uxMember.currentStep"), style = MaterialTheme.typography.labelSmall)
                else if (item.text("state") == "done") Text(tr("ux.journey.done"), style = MaterialTheme.typography.labelSmall)
            }
        }
    }
    Tile {
        CardHeading(tr("ux.journey." + step.text("key")))
        when (step.text("key")) {
            "event" -> {
                Text(currentEvent.text("title"), style = MaterialTheme.typography.titleMedium)
                Text(currentEvent.obj("city").text("name") + " · " + currentEvent.obj("venue").text("name"))
                Detail(tr("uxMember.starts"), dateTime(eventTime(currentEvent, "startsAt"), LocalLanguage.current, eventZone(currentEvent)))
                Text(tr("uxMember.journeyStart"))
                if (mayTapJourneyStep(step)) Action(tr("uxMember.chooseEvent"), enabled = !mutation.busy) { tap(step) }
                Action(tr("uxMember.viewEvent"), secondary = true) { go("event/$eventId") }
            }
            "poster" -> if (mayTapJourneyStep(step)) PosterShareStep(api, currentEvent, !mutation.busy) { tap(step) } else { EventPoster(api, currentEvent); Notice(tr("uxMember.posterPending")) }
            "reservation" -> {
                Text(tr("ux.journey.reservationBonus", "xp" to count(step.number("bonusXp"))))
                if (reservation.isNotEmpty()) {
                    Badge(tr("social." + reservation.text("status")), reservation.text("status"))
                    Text(reservation.text("slotCode"))
                    if (reservation.text("status") == "PENDING") Notice(tr("ux.journey.reservationRequested"))
                    if (reservation.text("conversationId").isNotBlank()) Action(tr("uxMember.openBooking"), secondary = true) { go("conversation/" + reservation.text("conversationId")) }
                } else {
                    if (canUseEventAction(currentEvent, "reserve")) Action(tr("uxMember.reservation"), maroon = true) { go("reservation/$eventId") }
                    else eventAction(currentEvent, "reserve").text("reason").takeIf { it.isNotBlank() }?.let { Notice(tr("ux.reason.$it")) }
                    if (mayTapJourneyStep(step)) Action(tr("ux.journey.reservationSkip"), enabled = !mutation.busy, secondary = true) { tap(step) }
                    if (step.text("outcome") == "skipped") Notice(tr("uxMember.reservationSkipped"))
                }
            }
            "checkIn" -> EventAttendance(session, currentEvent, go)
            "completed" -> {
                if (step.text("state") == "done" && canCompleteEventJourney(currentEvent)) {
                    Badge(tr("ux.journey.completed"), "OPEN")
                    Text(tr("uxMember.journeyCheckedIn"))
                } else {
                    EventAttendance(session, currentEvent, go)
                    Notice(tr(if (currentEvent.text("phase") == "ended") "uxMember.noAttendance" else "uxMember.completionWait"))
                }
                Action(tr("uxMember.viewEvent"), secondary = true) { go("event/$eventId") }
            }
        }
    }
}
