package id.znetworks.patsuniv

import android.content.Context
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject

/** The current member API requires a MEMBER account, independently of presentation mode. */
fun canParticipateInEvent(session: Session?) = session != null &&
    session.me.obj("user").text("role") == "MEMBER" && session.me.obj("member").isNotEmpty()

fun eventBrowsePath(session: Session?, admin: Boolean, all: Boolean): String =
    if (admin || (session != null && hasCapability(session, "city.operations") && !canParticipateInEvent(session))) "/api/admin/events"
    else "/api/events" + if (all) "?scope=all" else ""

fun eventIsOtherCity(session: Session?, event: JsonObject): Boolean {
    val city = session?.me?.obj("member")?.obj("city")?.text("id").orEmpty()
    return city.isNotBlank() && event.obj("city").text("id").isNotBlank() && city != event.obj("city").text("id")
}

/** Progress records deliberate viewing steps only. Attendance always comes from myCheckIn. */
fun canCompleteEventJourney(event: JsonObject) = event.obj("myCheckIn").isNotEmpty() || event.text("phase") == "ended"

@Composable fun EventPoster(api: Api, event: JsonObject) {
    var open by remember(event.text("id")) { mutableStateOf(false) }
    val flyer = event.text("flyerUrl")
    if (flyer.isNotBlank()) {
        Box(Modifier.fillMaxWidth().clickable(onClickLabel = tr("uxMember.viewPoster")) { open = true }) { NetworkImage(api, flyer) }
    }
    if (flyer.isNotBlank() || event.text("description").isNotBlank()) {
        Action(tr("uxMember.viewPoster"), secondary = true) { open = true }
    }
    if (open) Dialog(onDismissRequest = { open = false }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column(Modifier.fillMaxSize().padding(Space.page), verticalArrangement = Arrangement.spacedBy(Space.gap)) {
                Text(event.text("title"), style = MaterialTheme.typography.titleLarge)
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(Space.gap)) {
                    if (flyer.isNotBlank()) FullEventPoster(api, flyer, event.text("title"))
                    Text(event.text("description").ifBlank { tr("uxMember.posterDescriptionPending") })
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
@Composable fun PosterShareStep(api: Api, event: JsonObject, onContinue: () -> Unit) {
    var tapped by remember(event.text("id")) { mutableStateOf(false) }
    EventPoster(api, event)
    Notice(tr("uxMember.posterPending"))
    Action(tr("uxMember.sharePoster")) { tapped = true }
    if (tapped) {
        Notice(tr("uxMember.posterPlaceholder"))
        Action(tr("uxMember.continueReservation"), secondary = true, onClick = onContinue)
    }
}

@Composable fun EventAttendance(session: Session?, event: JsonObject, go: (String) -> Unit) {
    val zone = event.obj("city").text("timezone", "Asia/Jakarta")
    SectionLabel(tr("uxMember.yourAttendance"))
    if (!canParticipateInEvent(session)) {
        Notice(tr("uxMember.staffParticipation"))
        Detail(tr("uxMember.checkInOpens"), dateTime(event.text("checkInOpensAt"), LocalLanguage.current, zone))
        Detail(tr("uxMember.checkInCloses"), dateTime(event.text("checkInClosesAt"), LocalLanguage.current, zone))
        return
    }
    val checkIn = event.obj("myCheckIn")
    if (checkIn.isNotEmpty()) {
        CheckInStrip(checkIn, LocalLanguage.current, zone)
        Text(tr("uxMember.automaticXp"))
        Action(tr("uxMember.viewXpActivity"), secondary = true) { go("wallet/activity") }
    } else when (event.text("phase")) {
        "open" -> {
            Notice(tr("uxMember.showCrew"))
            Action(tr("uxMember.showQr"), maroon = true) { go("card") }
        }
        "ended" -> Notice(tr("uxMember.noAttendance"))
        "closed" -> Notice(tr("uxMember.checkInClosed"))
        else -> Notice(tr("uxMember.checkInNotOpen", "time" to dateTime(event.text("checkInOpensAt"), LocalLanguage.current, zone)))
    }
    Detail(tr("uxMember.checkInOpens"), dateTime(event.text("checkInOpensAt"), LocalLanguage.current, zone))
    Detail(tr("uxMember.checkInCloses"), dateTime(event.text("checkInClosesAt"), LocalLanguage.current, zone))
    if (eventIsOtherCity(session, event) && event.text("phase") != "ended") Notice(tr("uxMember.otherCityAdmission"))
}

@Composable fun EventJourney(session: Session, api: Api, event: JsonObject, go: (String) -> Unit) {
    if (!canParticipateInEvent(session)) return
    val context = LocalContext.current
    val account = session.me.obj("user").text("id")
    val eventId = event.text("id")
    val preferences = remember(context) { context.getSharedPreferences("pats-event-journey", Context.MODE_PRIVATE) }
    val key = "$account/$eventId"
    var step by remember(key) { mutableIntStateOf(preferences.getInt(key, 0).coerceIn(0, 4)) }
    fun advance(next: Int) { step = next; preferences.edit().putInt(key, next).apply() }
    val labels = listOf("nextEvent", "poster", "reservation", "checkIn", "completed")
    SectionLabel(tr("uxMember.yourJourney"))
    Column(verticalArrangement = Arrangement.spacedBy(Space.small)) {
        labels.forEachIndexed { index, label ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.small)) {
                Text((index + 1).toString(), style = MaterialTheme.typography.labelLarge)
                Text(tr("uxMember.steps.$label"), Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                if (index == step) Text(tr("uxMember.currentStep"), style = MaterialTheme.typography.labelSmall)
                else if (index < step) Text(tr("uxMember.viewedStep"), style = MaterialTheme.typography.labelSmall)
            }
        }
    }
    Tile {
        CardHeading(tr("uxMember.steps." + labels[step]))
        when (step) {
            0 -> {
                Text(event.text("title"), style = MaterialTheme.typography.titleMedium)
                Text(tr("uxMember.journeyStart"))
                Action(tr("uxMember.chooseEvent")) { advance(1) }
            }
            1 -> PosterShareStep(api, event) { advance(2) }
            2 -> {
                Text(tr("uxMember.reservationBonus"))
                if (event.text("phase") != "ended") Action(tr("uxMember.reservation"), maroon = true) { go("reservation/$eventId") }
                else Notice(tr("uxMember.reservationEnded"))
                Action(tr("uxMember.continueCheckIn"), secondary = true) { advance(3) }
            }
            3 -> {
                EventAttendance(session, event, go)
                if (canCompleteEventJourney(event)) Action(tr("uxMember.viewOutcome")) { advance(4) }
            }
            4 -> {
                Badge(tr("uxMember.steps.completed"), if (event.obj("myCheckIn").isNotEmpty()) "OPEN" else "")
                Text(tr(if (event.obj("myCheckIn").isNotEmpty()) "uxMember.journeyCheckedIn" else "uxMember.journeyEnded"))
                Action(tr("uxMember.viewEvent"), secondary = true) { go("event/$eventId") }
            }
        }
        if (step > 0) Action(tr("uxMember.previousStep"), secondary = true) { advance(step - 1) }
    }
}
