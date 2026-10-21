package id.znetworks.patsuniv

import android.app.Activity
import android.view.WindowManager
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import kotlinx.coroutines.*
import kotlinx.serialization.json.*

@Composable fun Hub(session: Session, api: Api, go: (String) -> Unit, selectedChannel: String = "", language: String = LocalLanguage.current, allowCapture: Boolean = false) {
    Title(tr("uxSocial.community"), tr("uxSocial.communityBody"))
    val admin = LocalAdminMode.current && hasCapability(session, "city.operations")
    var kind by rememberSaveable { mutableStateOf("TIMELINE") }
    Tabs(listOf("TIMELINE" to tr("social.TIMELINE"), "CHAT" to tr("social.CHAT")), kind) { kind = it }
    var city by rememberSaveable { mutableStateOf("") }
    var timelineId by rememberSaveable { mutableStateOf("") }
    var appliedChannel by rememberSaveable { mutableStateOf("") }
    var create by remember { mutableStateOf(false) }
    Remote(api, "/api/social/hub") { data, reload ->
        val visibleChannels = data.rows("channels").filter { admin || (it.text("visibility") != "ADMINS_ONLY" && !it.flag("archived")) }
        LaunchedEffect(selectedChannel) {
            if (selectedChannel.isNotBlank() && selectedChannel != appliedChannel) {
                visibleChannels.find { it.text("id") == selectedChannel }?.let { kind = it.text("kind"); city = it.text("cityId"); timelineId = it.text("id") }
                appliedChannel = selectedChannel
            }
        }
        val selected = if (data.rows("cities").any { it.text("id") == city }) city else data.text("homeCityId", data.rows("cities").firstOrNull()?.text("id").orEmpty())
        Choices(tr("social.city"), data.rows("cities").map { it.text("id") to it.text("name") }, selected) { city = it }
        if (selected.isNotBlank() && selected != data.text("homeCityId") && !admin) Notice(tr("uxSocial.temporaryCity"))
        if (admin) Action(tr("social.newChannel"), secondary = true) { create = !create }
        if (admin && create && selected.isNotBlank()) ChannelEditor(api, selected) { create = false; reload() }
        if (admin) {
            Action(tr("uxSocial.moderation"), secondary = true) { go("moderation/" + selected) }
            if (hasCapability(session, "hq.manage")) Action(tr("uxSocial.hubAccessQueue"), secondary = true) { go("hub-access/" + selected) }
        }
        val channels = visibleChannels.filter { it.text("cityId") == selected && it.text("kind") == kind }
        if (channels.isEmpty()) Empty(tr("social.noChannels"), tr("social.noChannelsBody"))
        if (kind == "TIMELINE" && channels.isNotEmpty()) {
            val current = channels.find { it.text("id") == timelineId } ?: channels.first()
            if (channels.size > 1) Choices(tr("uxSocial.updatesChannel"), channels.map { it.text("id") to it.text("name") }, current.text("id")) { timelineId = it }
            key(current.text("id")) { Feed(session, api, current.text("id"), "channel", current, data.obj("rules"), language, allowCapture) }
        } else channels.forEach { c -> Tile(selected = c.text("id") == selectedChannel) {
            Text(c.text("name"), style = MaterialTheme.typography.titleMedium)
            Text(tr("uxSocial.chatChannelBody"))
            if (c.flag("archived")) Text(tr("social.archived"))
            Action(tr("uxSocial.openChat"), secondary = true) { go("channel/" + c.text("id")) }
        } }
    }
}
@Composable fun Channel(session: Session, api: Api, id: String, conversation: Boolean, language: String, allowCapture: Boolean) {
    if (conversation) {
        ReservationConversationSummary(session, api, id, language) {
            Remote(api, "/api/social/hub") { hub, _ -> Feed(session, api, id, "conversation", null, hub.obj("rules"), language, allowCapture) }
        }
        return
    }
    Remote(api, "/api/social/hub") { hub, _ ->
        val channel = hub.rows("channels").find { it.text("id") == id }
        if (channel == null || (!LocalAdminMode.current && (channel.text("visibility") == "ADMINS_ONLY" || channel.flag("archived")))) Notice(tr("social.accessLost"), true)
        else Feed(session, api, id, "channel", channel, hub.obj("rules"), language, allowCapture)
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
    val admin = LocalAdminMode.current && hasCapability(session, "city.operations")
    val timeline = channel?.text("kind") == "TIMELINE"
    if (admin && channel != null) { Action(tr("common.edit"), secondary = true) { edit = !edit }; if (edit) ChannelEditor(api, channel.text("cityId"), channel) { edit = false; version++ } }
    var extra by remember { mutableStateOf<List<JsonObject>>(emptyList()) }; var moreCursor by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(version) { extra = emptyList(); moreCursor = null }
    Remote(api, "/api/social/feed?kind=$kind&id=${query(id)}", refresh = version, pollMs = 15000, onForbidden = { lost = true }) { data, reload ->
        val items = (data.rows("items") + extra).distinctBy { it.text("id") }.sortedWith(compareByDescending<JsonObject> { timeline && it.flag("pinned") }.thenBy { if (timeline) "" else it.text("createdAt") }.thenByDescending { if (timeline) it.text("createdAt") else "" })
        if (items.isEmpty()) Empty(tr("social.emptyTitle"), tr(if (timeline && !admin) "uxSocial.updatesEmpty" else if(kind == "conversation") "uxSocial.crewChatEmpty" else "social.emptyBody"))
        items.forEach { item -> key(item.text("id")) { Tile {
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
        } } }
        val cursor = moreCursor ?: data.text("nextCursor")
        if (cursor.isNotEmpty()) Action(tr("social.more"), !mutation.busy, true) { mutation.run { val next = api.request("GET", "/api/social/feed?kind=$kind&id=${query(id)}&cursor=${query(cursor)}"); extra = extra + next.rows("items"); moreCursor = next.text("nextCursor") } }
    }
    val mayPost = !timeline || (LocalAdminMode.current && channel.flag("canPostTimeline"))
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
fun newSendKey(): String = java.util.UUID.randomUUID().toString()
