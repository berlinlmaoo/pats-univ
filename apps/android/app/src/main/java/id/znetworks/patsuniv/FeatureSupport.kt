package id.znetworks.patsuniv

import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.foundation.layout.*
import androidx.compose.ui.Modifier
import kotlinx.coroutines.*
import kotlinx.serialization.json.*
import java.net.URLEncoder
import java.time.*
import java.time.format.DateTimeFormatter
import java.text.NumberFormat
import java.util.Locale

fun query(value: String) = URLEncoder.encode(value, "UTF-8")
fun count(value: Int) = NumberFormat.getIntegerInstance(Locale.forLanguageTag("id-ID")).format(value)
fun money(value: Int) = "Rp " + count(value)
fun zoneLabel(zone: String) = when(zone) { "Asia/Makassar" -> "WITA"; "Asia/Jayapura" -> "WIT"; else -> "WIB" }
fun dateTime(value: String, language: String, zone: String = "Asia/Jakarta"): String = runCatching {
    val date = Instant.parse(value).atZone(ZoneId.of(zone))
    val suffix = when(zone) { "Asia/Makassar" -> "WITA"; "Asia/Jayapura" -> "WIT"; else -> "WIB" }
    date.format(DateTimeFormatter.ofPattern("d MMM yyyy · HH.mm", Locale.forLanguageTag(language))) + " " + suffix
}.getOrDefault(value)
fun validCount(value: String, max: Int = 1_000_000) = value.toIntOrNull()?.let { it in 0..max } == true
fun canEnterDraw(draw: JsonObject, now: Instant = Instant.now()): Boolean = runCatching {
    draw.text("startedAt").isEmpty() && draw.text("ownEntryId").isEmpty() && draw.rows("entries").size < draw.number("capacity") &&
        draw.text("prize").isNotBlank() && now >= Instant.parse(draw.text("peakStartsAt")) && now < Instant.parse(draw.text("peakEndsAt"))
}.getOrDefault(false)
fun hasCapability(session: Session, capability: String) = session.me.obj("user")["capabilities"]?.jsonArray?.any { it.jsonPrimitive.content == capability } == true

class Mutation(private val scope: CoroutineScope) {
    var busy by mutableStateOf(false); private set
    var failure by mutableStateOf<String?>(null); private set
    var failureArgs by mutableStateOf<Array<Pair<String, String>>>(emptyArray()); private set
    var notice by mutableStateOf<String?>(null)
    fun run(block: suspend () -> Unit) {
        if (busy) return
        busy = true; failure = null; notice = null
        scope.launch {
            try { block() } catch(e: CancellationException) { throw e } catch(e: Exception) { failure = if (e is TagFailure) e.key else errorKey((e as? ApiFailure)?.code ?: "INTERNAL"); failureArgs = errorArgs(e) }
            finally { busy = false }
        }
    }
}
@Composable fun rememberMutation(): Mutation { val scope = rememberCoroutineScope(); return remember(scope) { Mutation(scope) } }
@Composable fun MutationStatus(state: Mutation) { state.failure?.let { Notice(tr(it, *state.failureArgs), true) }; state.notice?.let { Notice(tr(it)) }; if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth()) }
@Composable fun Decide(label: String, message: String, enabled: Boolean = true, secondary: Boolean = false, maroon: Boolean = false, title: String = label, action: () -> Unit) {
    var open by remember { mutableStateOf(false) }
    Action(label, enabled, secondary, maroon = maroon) { open = true }
    if (open) Confirm(label, message, { open = false }, title = title) { open = false; action() }
}
@Composable fun Choices(label: String, options: List<Pair<String, String>>, selected: String, change: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Column {
        SectionLabel(label)
        Box {
            OutlinedButton({ expanded = true }, Modifier.fillMaxWidth().heightIn(min = Space.control), enabled = options.isNotEmpty(), shape = MaterialTheme.shapes.medium) { Text(options.find { it.first == selected }?.second ?: tr("common.notSet")) }
            DropdownMenu(expanded, { expanded = false }) { options.forEach { (id, name) -> DropdownMenuItem(text = { Text(name) }, onClick = { change(id); expanded = false }) } }
        }
    }
}
@Composable fun liveVersion(api: Api, kind: String, id: String): Int {
    var version by remember(kind, id) { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    val room = remember(kind, id) { RealtimeRoom() }
    LaunchedEffect(kind, id) { if (id.isNotBlank()) runCatching { room.connect(api, kind, id, { scope.launch { version++ } }, { scope.launch { version++ } }) } }
    DisposableEffect(room) { onDispose { room.close() } }
    return version
}

fun leaderboardPeriod(data: JsonObject, language: String): String = runCatching {
    val start = Instant.parse(data.text("periodStart")).atZone(ZoneId.of("Asia/Jakarta"))
    val end = Instant.parse(data.text("periodEnd")).atZone(ZoneId.of("Asia/Jakarta"))
    val period = if(data.text("mode") == "QUARTERLY") "Q" + ((start.monthValue-1)/3+1) + " " + start.year else start.format(DateTimeFormatter.ofPattern("MMM yyyy",Locale.forLanguageTag(language)))
    period + " · reset " + end.format(DateTimeFormatter.ofPattern("d MMM",Locale.forLanguageTag(language)))
}.getOrDefault("")
