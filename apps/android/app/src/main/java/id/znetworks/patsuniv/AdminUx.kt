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
