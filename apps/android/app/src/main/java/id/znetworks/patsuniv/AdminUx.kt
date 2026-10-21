package id.znetworks.patsuniv

import androidx.compose.material3.*
import androidx.compose.runtime.*
import kotlinx.coroutines.delay
import kotlinx.serialization.json.*
import java.time.Instant

@Composable fun adminNow(): Instant {
    var now by remember { mutableStateOf(Instant.now()) }
    LaunchedEffect(Unit) { while (true) { now = Instant.now(); delay(1000) } }
    return now
}
@Composable fun AdminEventContext(event: JsonObject, language: String) {
    Tile {
        SectionLabel(tr("uxAdmin.eventContext"))
        Text(event.text("title"), style = MaterialTheme.typography.titleLarge)
        Text(event.obj("city").text("name"), style = MaterialTheme.typography.titleMedium)
        Text(tr("uxAdmin.starts") + ": " + dateTime(event.text("startsAt"), language, event.obj("city").text("timezone", "Asia/Jakarta")))
        Badge(tr("eventPhase." + event.text("phase")), event.text("phase"))
    }
}
@Composable fun AdminScanUnavailable(workspace: JsonObject, language: String, now: Instant = Instant.now()) {
    val event = workspace.obj("event")
    val lifecycle = workspace.obj("lifecycle")
    val zone = event.obj("city").text("timezone", "Asia/Jakarta")
    val ended = lifecycle.text("scanUnavailable") == "checkInEnded" || runCatching { now >= Instant.parse(lifecycle.text("checkInClosesAt")) }.getOrDefault(true)
    if (ended) Notice(tr("ux.workspace.checkInEnded", "time" to dateTime(lifecycle.text("checkInClosesAt"), language, zone)))
    else {
        Notice(tr("ux.reason.checkInNotOpen"))
        Text(tr("uxAdmin.checkInOpens") + ": " + dateTime(lifecycle.text("checkInOpensAt"), language, zone))
    }
}
