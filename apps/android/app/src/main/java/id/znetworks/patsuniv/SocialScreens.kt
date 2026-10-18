package id.znetworks.patsuniv

import android.app.Activity
import android.view.WindowManager
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import kotlinx.coroutines.*
import kotlinx.serialization.json.*

@Composable fun Hub(session: Session, api: Api, go: (String) -> Unit, selectedChannel: String = "") {
    Title(tr("social.title"), tr("social.subtitle"))
    val admin = hasCapability(session, "city.operations")
    Action(tr(if (admin) "social.operations" else "social.reservations"), secondary = true) { go("social-operations") }
    if (!admin) Action(tr("social.roaming"), secondary = true) { go("roaming") }
    var kind by remember { mutableStateOf("TIMELINE") }
    Tabs(listOf("TIMELINE" to tr("social.TIMELINE"), "CHAT" to tr("social.CHAT"), "reservations" to tr("social.reservations")), kind) { if(it == "reservations") go("social-operations") else kind = it }
    var city by remember { mutableStateOf("") }; var create by remember { mutableStateOf(false) }
    Remote(api, "/api/social/hub") { data, reload ->
        LaunchedEffect(selectedChannel) { data.rows("channels").find { it.text("id") == selectedChannel }?.let { kind = it.text("kind"); city = it.text("cityId") } }
        val selected = if (data.rows("cities").any { it.text("id") == city }) city else data.text("homeCityId", data.rows("cities").firstOrNull()?.text("id").orEmpty())
        Choices(tr("social.city"), data.rows("cities").map { it.text("id") to it.text("name") }, selected) { city = it }
        if (admin) Action(tr("social.newChannel"), secondary = true) { create = !create }
        if (create && selected.isNotBlank()) ChannelEditor(api, selected) { create = false; reload() }
        val channels = data.rows("channels").filter { it.text("cityId") == selected && it.text("kind") == kind }
        if (channels.isEmpty()) Empty(tr("social.noChannels"), tr("social.noChannelsBody"))
        if(channels.isNotEmpty()) Notice(tr("native.selectChannel"))
        channels.forEach { c -> Tile(selected = c.text("id") == selectedChannel) { Text(c.text("name"), style = MaterialTheme.typography.titleMedium); Text(tr("social." + c.text("kind"))); if (c.flag("archived")) Text(tr("social.archived")); Action(tr("common.continue"), secondary = c.text("id") != selectedChannel) { go("channel/" + c.text("id")) } } }
    }
}
@Composable fun Channel(session: Session, api: Api, id: String, conversation: Boolean, language: String, allowCapture: Boolean) {
    Remote(api, "/api/social/hub") { hub, _ ->
        val channel = hub.rows("channels").find { it.text("id") == id }
        if (!conversation && channel == null) Notice(tr("social.accessLost"), true)
        else Feed(session, api, id, if (conversation) "conversation" else "channel", channel, hub.obj("rules"), language, allowCapture)
    }
}
@Composable fun Feed(session: Session, api: Api, id: String, kind: String, channel: JsonObject?, rules: JsonObject, language: String, allowCapture: Boolean) {
    val context = LocalContext.current
    DisposableEffect(kind, id, allowCapture) {
        if (kind == "channel" && !allowCapture) (context as? Activity)?.window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        onDispose { (context as? Activity)?.window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE) }
    }
    val scope = rememberCoroutineScope(); val live = remember(kind, id) { RealtimeRoom() }
    val connected by live.connected.collectAsState()
    var version by remember { mutableIntStateOf(0) }; var lost by remember { mutableStateOf(false) }
    LaunchedEffect(kind, id) { try { live.connect(api, kind, id, { scope.launch { version++ } }, { scope.launch { lost = true } }) } catch(e: CancellationException) { throw e } catch (_: Exception) { } }
    DisposableEffect(live) { onDispose { live.close() } }
    Title(channel?.text("name") ?: tr("social.chat"))
    Text(tr(if (connected) "social.live" else "social.offline"), style = MaterialTheme.typography.bodySmall)
    if (kind == "channel") Notice(tr("social.secureHint"))
    if (lost) { Notice(tr("social.accessLost"), true); return }
    var message by remember { mutableStateOf("") }; var attachment by remember { mutableStateOf<JsonObject?>(null) }; var edit by remember { mutableStateOf(false) }
    // One key per draft: a retry after a lost ack is deduplicated by the server instead of posting twice.
    var sendKey by remember(kind, id) { mutableStateOf(newSendKey()) }
    val mutation = rememberMutation(); MutationStatus(mutation)
    val admin = hasCapability(session, "city.operations")
    val timeline = channel?.text("kind") == "TIMELINE"
    if (admin && channel != null) { Action(tr("common.edit"), secondary = true) { edit = !edit }; if (edit) ChannelEditor(api, channel.text("cityId"), channel) { edit = false; version++ } }
    var extra by remember { mutableStateOf<List<JsonObject>>(emptyList()) }; var moreCursor by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(version) { extra = emptyList(); moreCursor = null }
    Remote(api, "/api/social/feed?kind=$kind&id=${query(id)}", refresh = version, pollMs = 15000, onForbidden = { lost = true }) { data, reload ->
        val items = (data.rows("items") + extra).distinctBy { it.text("id") }.sortedWith(compareByDescending<JsonObject> { timeline && it.flag("pinned") }.thenBy { if (timeline) "" else it.text("createdAt") }.thenByDescending { if (timeline) it.text("createdAt") else "" })
        if (items.isEmpty()) Empty(tr("social.emptyTitle"), tr("social.emptyBody"))
        items.forEach { item -> Tile {
            Text(item.obj("author").text("name") + if (item.flag("pinned")) " · " + tr("social.pinned") else "", style = MaterialTheme.typography.titleMedium)
            Text(dateTime(item.text("createdAt"), language), style = MaterialTheme.typography.bodySmall)
            if (item.text("body").isNotBlank()) Text(item.text("body"))
            if (item.text("mediaUrl").isNotBlank()) MediaPlayback(api, item.text("mediaUrl"), item.text("mediaType"))
            if (timeline) Action(tr(if (item.flag("reacted")) "phase5.reacted" else "phase5.react") + " · " + count(item.number("reactionCount")), !mutation.busy, true) { mutation.run { api.request("POST", "/api/social/react", body("postId" to item.text("id"), "active" to !item.flag("reacted"))); reload() } }
            if (admin && channel != null) {
                if (timeline) Action(tr(if (item.flag("pinned")) "social.unpin" else "social.pin"), !mutation.busy, true) { mutation.run { api.request("POST", "/api/social/moderate", body("action" to "pin", "id" to item.text("id"), "pinned" to !item.flag("pinned"))); reload() } }
                Decide(tr("social.delete"), tr("social.deleteBody"), !mutation.busy, true) { mutation.run { api.request("POST", "/api/social/moderate", body("action" to if (timeline) "deletePost" else "deleteMessage", "id" to item.text("id"))); reload() } }
                if (item.obj("author").text("id") != session.me.obj("user").text("id")) Decide(tr("social.mute"), tr("social.muteBody"), !mutation.busy, true) { mutation.run { api.request("POST", "/api/social/moderate", body("action" to "mute", "cityId" to channel.text("cityId"), "userId" to item.obj("author").text("id"), "muted" to true)); reload() } }
            }
        } }
        val cursor = moreCursor ?: data.text("nextCursor")
        if (cursor.isNotEmpty()) Action(tr("social.more"), !mutation.busy, true) { mutation.run { val next = api.request("GET", "/api/social/feed?kind=$kind&id=${query(id)}&cursor=${query(cursor)}"); extra = extra + next.rows("items"); moreCursor = next.text("nextCursor") } }
    }
    val mayPost = !timeline || channel.flag("canPostTimeline")
    if (mayPost && channel?.flag("archived") != true) {
        Field(tr("social.message"), message, { val next = it.take(4000); if (next != message) sendKey = newSendKey(); message = next }, multiline = true)
        Text(tr("social.mediaHint", "seconds" to rules.number("mediaMaxSeconds").toString(), "mb" to rules.number("mediaMaxMb").toString()), style = MaterialTheme.typography.bodySmall)
        if (!mutation.busy) MediaCapture(timeline, rules.number("mediaMaxSeconds").coerceAtLeast(1)) { bytes, contentType, mediaType -> mutation.run {
            val signed = api.request("POST", "/api/social/upload", body("room" to body("kind" to kind, "id" to id), "contentType" to contentType))
            if (bytes.size > signed.number("maxBytes")) throw ApiFailure("MEDIA_INVALID")
            api.media(signed.text("url"), bytes, contentType); attachment = body("mediaKey" to signed.text("key"), "mediaType" to mediaType); sendKey = newSendKey()
        } }
        if (attachment != null) { Notice(tr("social.attachment")); Action(tr("social.removeAttachment"), secondary = true) { attachment = null; sendKey = newSendKey() } }
        Action(tr(if (timeline) "social.post" else "social.send"), !mutation.busy && (message.isNotBlank() || attachment != null)) {
            mutation.run {
                val payload = JsonObject(body("body" to message.trim(), (if (kind == "channel") "channelId" else "conversationId") to id) + attachment.orEmpty())
                if (timeline) api.request("POST", "/api/social/posts", payload)
                else {
                    val keyed = JsonObject(payload + ("clientId" to JsonPrimitive(sendKey)))
                    if (connected) {
                        try { live.sendAwait(keyed) } catch (_: TimeoutCancellationException) { throw ApiFailure("NETWORK") }
                    } else api.request("POST", "/api/social/messages", keyed)
                }
                message = ""; attachment = null; sendKey = newSendKey(); extra = emptyList(); moreCursor = null; version++
            }
        }
    }
}
@Composable fun ChannelEditor(api: Api, cityId: String, channel: JsonObject? = null, saved: () -> Unit) {
    var name by remember(channel) { mutableStateOf(channel?.text("name").orEmpty()) }; var kind by remember { mutableStateOf(channel?.text("kind") ?: "CHAT") }; var visibility by remember { mutableStateOf(channel?.text("visibility") ?: "MEMBERS") }; var posting by remember { mutableStateOf(if (channel?.get("memberPosting") is JsonPrimitive && channel["memberPosting"] != JsonNull) channel.flag("memberPosting").toString() else "default") }
    val mutation = rememberMutation()
    Tile {
        Field(tr("social.channelName"), name, { name = it.take(80) })
        if (channel == null) Choices(tr("social.kind"), listOf("CHAT", "TIMELINE").map { it to tr("social.$it") }, kind) { kind = it }
        Choices(tr("social.visibility"), listOf("MEMBERS", "ADMINS_ONLY").map { it to tr("social.$it") }, visibility) { visibility = it }
        Choices(tr("social.posting"), listOf("default" to tr("social.defaultPosting"), "true" to tr("social.membersPosting"), "false" to tr("social.adminsPosting")), posting) { posting = it }
        fun save(archived: Boolean) { mutation.run { var data = body("cityId" to cityId, "name" to name, "kind" to kind, "visibility" to visibility, "memberPosting" to if (posting == "default") null else posting == "true", "archived" to archived); channel?.let { data = JsonObject(data + ("id" to JsonPrimitive(it.text("id")))) }; api.request("POST", "/api/social/channels", data); saved() } }
        Action(tr("common.save"), name.isNotBlank() && !mutation.busy) { save(channel?.flag("archived") == true) }
        if (channel != null) Decide(tr(if (channel.flag("archived")) "social.restore" else "social.archive"), tr("social.decisionBody"), !mutation.busy, true) { save(!channel.flag("archived")) }
        MutationStatus(mutation)
    }
}
@Composable fun Roaming(session: Session, api: Api, initial: String, go: (String) -> Unit) {
    Title(tr("social.roaming"), tr("social.roamingHint"))
    var event by remember { mutableStateOf(initial) }; var type by remember { mutableStateOf("ATTENDANCE") }; val mutation = rememberMutation(); MutationStatus(mutation)
    Remote(api, "/api/events?scope=all") { data, _ ->
        val events = data.rows("upcoming").filter { it.obj("city").text("id") != session.me.obj("member").obj("city").text("id") }
        Choices(tr("social.event"), events.map { it.text("id") to (it.obj("city").text("name") + " · " + it.text("title")) }, event) { event = it }
        if (events.isEmpty()) Empty(tr("app.eventsEmptyTitle"), tr("social.roamingHint"))
        Choices(tr("social.kind"), listOf("ATTENDANCE", "SOCIAL_HUB").map { it to tr("social.$it") }, type) { type = it }
        Action(tr("social.requestRoaming"), event.isNotBlank() && !mutation.busy) { mutation.run { api.request("POST", "/api/social/roaming", body("eventId" to event, "type" to type)); mutation.notice = "social.saved" } }
    }
    Action(tr("social.review"), secondary = true) { go("social-operations") }
}
@Composable fun Reservation(api: Api, eventId: String, go: (String) -> Unit) {
    Title(tr("social.reserve"), tr("social.floorHint"))
    var slot by remember { mutableStateOf("") }; var pax by remember { mutableStateOf("1") }; var note by remember { mutableStateOf("") }; val mutation = rememberMutation(); MutationStatus(mutation)
    Remote(api, "/api/social/slots?eventId=${query(eventId)}") { data, reload ->
        Text(data.text("eventTitle"), style = MaterialTheme.typography.titleLarge); Text(data.text("venueName"))
        val slots = data.rows("slots"); val taken = (data["taken"] as? JsonArray)?.map { it.jsonPrimitive.content }.orEmpty()
        if (slots.isEmpty()) Empty(tr("social.noSlots"), tr("social.noSlotsBody")) else {
            BoxWithConstraints(Modifier.fillMaxWidth().aspectRatio(1f).background(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.large)) {
                val unit = maxWidth / 12
                slots.forEach { s -> val selected = slot == s.text("code"); val unavailable = s.text("code") in taken
                    Surface(Modifier.offset(unit * s.number("x"), unit * s.number("y")).size(unit * s.number("w"), unit * s.number("h")).padding(Space.tiny / 2).clickable(enabled = !unavailable) { slot = s.text("code"); pax = "1" }, color = if (selected) MaterialTheme.colorScheme.primary else if (unavailable) MaterialTheme.colorScheme.outlineVariant else MaterialTheme.colorScheme.surface, shape = MaterialTheme.shapes.small) { Box(contentAlignment = Alignment.Center) { Text(s.text("code"), style = MaterialTheme.typography.labelSmall, maxLines = 1, softWrap = false) } }
                }
            }
            Choices(tr("social.slot"), slots.filter { it.text("code") !in taken }.map { it.text("code") to (it.text("code") + " · " + tr("social." + it.text("kind")) + " · " + count(it.number("pax"))) }, slot) { slot = it }
            val selected = slots.find { it.text("code") == slot }
            selected?.let { Text(tr("social.minimumSpend") + ": " + it.text("minimumSpend")); if (it["minimumCharge"] is JsonPrimitive) Text(tr("phase5.minimumCharge") + ": " + money(it.number("minimumCharge"))) }
            Field(tr("social.pax"), pax, { pax = it }, KeyboardType.Number); Field(tr("social.note"), note, { note = it.take(4000) }, multiline = true)
            Decide(tr("social.reserve"), tr("social.decisionBody"), !mutation.busy && selected != null && slot !in taken && pax.toIntOrNull()?.let { it in 1..selected.number("pax").coerceAtMost(100) } == true) {
                mutation.run { try { val result = api.request("POST", "/api/social/reserve", body("eventId" to eventId, "slotCode" to slot, "pax" to pax.toInt(), "note" to note)); go("conversation/" + result.text("conversationId")) } finally { reload() } }
            }
        }
    }
}
@Composable fun SocialOperations(session: Session, api: Api, language: String, go: (String) -> Unit) {
    Title(tr("social.operations"))
    val mutation = rememberMutation(); MutationStatus(mutation); val admin = hasCapability(session, "city.operations")
    Remote(api, "/api/social/operations", pollMs = 15000) { data, reload ->
        fun decide(path: String, payload: JsonObject) { mutation.run { api.request("POST", "/api/social/$path", payload); reload() } }
        Text(tr("social.reservations"), style = MaterialTheme.typography.titleLarge)
        if (data.rows("reservations").isEmpty()) Empty(tr("social.noRequests"), tr("social.noRequestsBody"))
        data.rows("reservations").forEach { r -> Tile {
            Text(r.obj("event").text("title") + " · " + r.text("slotCode"), style = MaterialTheme.typography.titleMedium); Text(r.obj("member").text("fullName") + " · " + count(r.number("pax"))); Text(tr("social." + r.text("status"))); Text(r.text("note")); Text(tr("phase5.minimumCharge") + ": " + money(r.number("minimumCharge")))
            if (r.obj("conversation").isNotEmpty()) Action(tr("social.chat"), secondary = true) { go("conversation/" + r.obj("conversation").text("id")) }
            if (r.flag("canDecide") && r.text("status") == "PENDING") listOf("CONFIRMED" to "social.confirm", "REJECTED" to "social.reject").forEach { (status, key) -> Decide(tr(key), tr("social.decisionBody"), !mutation.busy, true) { decide("reservation-decision", body("id" to r.text("id"), "status" to status)) } }
            if ((!admin || r.flag("canDecide")) && r.text("status") in setOf("PENDING", "CONFIRMED")) Decide(tr("social.cancelReservation"), tr("social.decisionBody"), !mutation.busy, true) { decide("reservation-decision", body("id" to r.text("id"), "status" to "CANCELLED")) }
        } }
        Text(tr("social.roaming"), style = MaterialTheme.typography.titleLarge)
        if (data.rows("roaming").isEmpty()) Notice(tr("social.noRequests"))
        data.rows("roaming").forEach { r -> Tile {
            Text(r.obj("member").text("fullName") + " · " + r.obj("event").text("title")); Text(tr("social." + r.text("type")) + " · " + tr("social." + r.text("status")))
            if (r.text("accessExpiresAt").isNotBlank()) Text(tr("social.expires", "date" to dateTime(r.text("accessExpiresAt"), language)))
            if (r.text("status") == "PENDING" && admin && (r.text("type") == "ATTENDANCE" || hasCapability(session, "hq.manage"))) listOf("APPROVED" to "social.approve", "REJECTED" to "social.reject").forEach { (decision, key) -> Decide(tr(key), tr("social.decisionBody"), !mutation.busy, true) { decide("roaming-decision", body("id" to r.text("id"), "decision" to decision)) } }
        } }
        if (admin) {
            Text(tr("social.muted"), style = MaterialTheme.typography.titleLarge)
            if (data.rows("muted").isEmpty()) Notice(tr("social.noMuted"))
            data.rows("muted").forEach { m -> Tile { Text(m.text("name")); Decide(tr("social.unmute"), tr("social.decisionBody"), !mutation.busy, true) { decide("moderate", body("action" to "mute", "cityId" to m.text("cityId"), "userId" to m.text("userId"), "muted" to false)) } } }
            Text(tr("social.screenshots"), style = MaterialTheme.typography.titleLarge)
            if (data.rows("screenshots").isEmpty()) Notice(tr("social.noScreenshots"))
            data.rows("screenshots").forEach { Text(it.text("name") + " · " + count(it.number("count"))) }
        }
    }
}
fun newSendKey(): String = java.util.UUID.randomUUID().toString()
