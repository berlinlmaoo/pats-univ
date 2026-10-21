package id.znetworks.patsuniv

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import java.io.ByteArrayOutputStream

@Composable fun EventContent(api: Api, eventId: String, language: String, go: (String) -> Unit) {
    Title(tr("ux.content.title"))
    if (!LocalAdminMode.current || eventId.isBlank()) { Notice(tr("errors.forbidden"), true); return }
    Remote(api, "/api/admin/events/${query(eventId)}") { data, _ ->
        val event = data.obj("event")
        Text(event.text("title"), style = MaterialTheme.typography.titleLarge)
        Text(event.obj("city").text("name") + " · " + dateTime(event.text("startsAt"), language, event.obj("city").text("timezone", "Asia/Jakarta")))
    }
    Remote(api, "/api/admin/events/${query(eventId)}/content") { data, reload ->
        val live = data.obj("live"); val pending = data.obj("pending")
        val approval = data.text("mode") == "approval"
        SectionLabel(tr("ux.content.live"))
        if (live.text("url").isNotBlank()) NetworkImage(api, live.text("url"))
        Text(live.text("description").ifBlank { "—" })
        if (pending.isNotEmpty()) {
            SectionLabel(tr("ux.content.pending"))
            ContentSubmission(api, pending, language)
        }
        Notice(tr(if (approval) "ux.content.approvalHint" else "ux.content.directHint"))
        if (pending.isNotEmpty()) Notice(tr("ux.content.replacesPending"))
        var description by rememberSaveable(eventId, pending.text("id"), live.text("description")) { mutableStateOf(pending.text("description", live.text("description"))) }
        var poster by remember(eventId) { mutableStateOf<ByteArray?>(null) }
        var contentType by remember(eventId) { mutableStateOf("image/jpeg") }
        var succeeded by remember(eventId) { mutableStateOf(false) }
        val context = LocalContext.current
        val mutation = rememberMutation()
        val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
            if (uri != null) mutation.run {
                val type = context.contentResolver.getType(uri).orEmpty()
                if (type !in setOf("image/jpeg", "image/png", "image/webp")) throw TagFailure("validation.flyerType")
                val bytes = withContext(Dispatchers.IO) {
                    context.contentResolver.openInputStream(uri)?.use { input ->
                        val output = ByteArrayOutputStream(); val buffer = ByteArray(8192)
                        while (true) {
                            val count = input.read(buffer); if (count < 0) break
                            if (output.size() + count > 5 * 1024 * 1024) throw TagFailure("validation.flyerTooLarge")
                            output.write(buffer, 0, count)
                        }
                        output.toByteArray()
                    } ?: throw TagFailure("validation.flyerRequired")
                }
                val bounds = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
                withContext(Dispatchers.Default) { android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds) }
                if (bytes.isEmpty() || bounds.outWidth <= 0 || bounds.outHeight <= 0) throw TagFailure("validation.flyerType")
                poster = bytes; contentType = type; succeeded = false
            }
        }
        Field(tr("ux.content.descriptionLabel"), description, { description = it; succeeded = false }, multiline = true)
        if (description.length > 2000) Notice(tr("validation.tooLong"), true)
        var preview by remember(eventId) { mutableStateOf<android.graphics.Bitmap?>(null) }
        LaunchedEffect(poster) { preview = null; preview = poster?.let { bytes -> withContext(Dispatchers.Default) { decodeMediaBitmap(bytes, maxDimension = 1600) } } }
        preview?.let { Image(it.asImageBitmap(), tr("ux.content.posterLabel"), Modifier.fillMaxWidth().heightIn(max = Space.qr)) }
        Action(tr("ux.content.posterLabel"), !mutation.busy, true) { picker.launch("image/*") }
        if (poster != null) Action(tr("social.removeAttachment"), !mutation.busy, true) { poster = null }
        val changed = poster != null || description.trim() != live.text("description")
        Decide(tr(if (approval) "ux.content.submit" else "ux.content.save"), tr(if (approval) "ux.content.approvalHint" else "ux.content.directHint"), !mutation.busy && changed && description.length <= 2000) {
            mutation.run { api.saveEventContent(eventId, description.trim(), poster, contentType); poster = null; succeeded = true; reload() }
        }
        MutationStatus(mutation)
        if (succeeded) Notice(tr(if (approval) "ux.content.submitted" else "ux.content.saved"))
        if (data.rows("history").isNotEmpty()) {
            SectionLabel(tr("ktm.history"))
            data.rows("history").forEach { ContentSubmission(api, it, language) }
        }
    }
    Action(tr("ux.workspace.title"), secondary = true) { go("city-event/$eventId") }
}

@Composable private fun ContentSubmission(api: Api, item: JsonObject, language: String) {
    Tile {
        if (item.text("eventTitle").isNotBlank()) Text(item.text("eventTitle"), style = MaterialTheme.typography.titleMedium)
        if (item.obj("city").text("name").isNotBlank()) Text(item.obj("city").text("name"))
        Badge(tr("ux.content." + "status" + item.text("status")), item.text("status"))
        Text(tr("ux.content.by", "name" to item.text("submittedBy"), "date" to dateTime(item.text("submittedAt"), language)))
        if (item.text("posterUrl").isNotBlank()) NetworkImage(api, item.text("posterUrl"), staffOnly = true)
        if (item.text("description").isNotBlank()) Text(item.text("description"))
        if (item.text("note").isNotBlank()) Notice(item.text("note"))
        if (item.text("decidedAt").isNotBlank()) Text(tr("ux.content.by", "name" to item.text("decidedBy"), "date" to dateTime(item.text("decidedAt"), language)))
    }
}

@Composable fun ContentApprovals(session: Session, api: Api, language: String, go: (String) -> Unit, selectedSubmission: String = "") {
    Title(tr("ux.content.queueTitle"))
    if (!LocalAdminMode.current || !hasCapability(session, "hq.manage")) { Notice(tr("errors.forbidden"), true); return }
    var status by rememberSaveable(selectedSubmission) { mutableStateOf(if (selectedSubmission.isBlank()) "PENDING" else "ALL") }
    Choices(tr("common.status"), listOf("PENDING", "APPROVED", "REJECTED", "WITHDRAWN", "ALL").map { it to tr(if (it == "ALL") "uxShell.allStatuses" else "ux.content.status$it") }, status) { status = it }
    Remote(api, "/api/admin/content-submissions?status=$status", pollMs = 30_000) { data, reload ->
        val rows = data.rows("submissions").sortedBy { if (it.text("id") == selectedSubmission) 0 else 1 }
        if (rows.isEmpty()) Empty(tr("ux.content.queueEmpty"), tr("ux.content.queueEmptyBody"))
        rows.forEach { item ->
            key(item.text("id")) {
                ContentSubmission(api, item, language)
                Action(tr("ux.content.live"), secondary = true) { go("event-content/" + item.text("eventId")) }
                if (item.text("status") == "PENDING") {
                    var note by rememberSaveable(item.text("id")) { mutableStateOf("") }
                    val mutation = rememberMutation()
                    Field(tr("ux.content.rejectReason"), note, { note = it.take(500) }, multiline = true)
                    Decide(tr("ux.content.approve"), tr("ux.content.approved"), !mutation.busy) {
                        mutation.run { api.request("POST", "/api/admin/content-submissions/${query(item.text("id"))}/decision", body("decision" to "APPROVED", "note" to note.trim())); reload() }
                    }
                    Decide(tr("ux.content.reject"), tr("ux.content.rejected"), !mutation.busy && note.trim().length >= 3, secondary = true) {
                        mutation.run { api.request("POST", "/api/admin/content-submissions/${query(item.text("id"))}/decision", body("decision" to "REJECTED", "note" to note.trim())); reload() }
                    }
                    MutationStatus(mutation)
                }
            }
        }
    }
}
