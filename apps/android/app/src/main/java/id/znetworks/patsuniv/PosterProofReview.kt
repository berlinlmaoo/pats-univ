package id.znetworks.patsuniv

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject

private val posterProofStatuses = setOf("PENDING", "APPROVED", "REJECTED")

/** The server applies city permissions; an event filter never broadens that scope. */
fun posterProofQueuePath(status: String, eventId: String? = null): String {
    require(status in posterProofStatuses)
    return "/api/admin/poster-proofs?status=$status" +
        (eventId?.takeIf { it.isNotBlank() }?.let { "&eventId=${query(it)}" } ?: "")
}

fun posterProofDecisionPayload(decision: String, reason: String): JsonObject {
    require(decision in setOf("APPROVED", "REJECTED"))
    val trimmed = if (decision == "REJECTED") reason.trim() else ""
    require(decision != "REJECTED" || trimmed.length in 3..500)
    return body("decision" to decision, "reason" to trimmed)
}

/** Private proof screenshots use only Api's narrowly allowed authenticated image route. */
@Composable fun PosterProofImage(api: Api, url: String, contentDescription: String = tr("ux.notifAction.viewProof")) {
    key(api.userId, url) {
        var bitmap by remember { mutableStateOf<android.graphics.Bitmap?>(null) }
        var failure by remember { mutableStateOf<String?>(null) }
        var attempt by remember { mutableIntStateOf(0) }
        var open by remember { mutableStateOf(false) }
        LaunchedEffect(api, url, attempt) {
            failure = null
            try {
                val bytes = api.posterProofImage(url)
                bitmap = withContext(Dispatchers.Default) { decodeMediaBitmap(bytes, maxDimension = 2048) }
                if (bitmap == null) failure = "errors.mediaInvalid"
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { failure = errorKey((e as? ApiFailure)?.code ?: "NETWORK") }
        }
        if (bitmap == null && failure == null) LoadingSkeleton()
        failure?.let {
            Notice(tr(it), true)
            Action(tr("common.retry"), secondary = true) { attempt++ }
        }
        bitmap?.let { image ->
            Image(image.asImageBitmap(), contentDescription,
                Modifier.fillMaxWidth().heightIn(max = Space.qr).clickable(onClickLabel = contentDescription) { open = true })
            Action(tr("ux.notifAction.viewProof"), secondary = true) { open = true }
            if (open) Dialog(onDismissRequest = { open = false }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    Column(Modifier.fillMaxSize().padding(Space.page), verticalArrangement = Arrangement.spacedBy(Space.gap)) {
                        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                            Image(image.asImageBitmap(), contentDescription, Modifier.fillMaxWidth()
                                .aspectRatio(image.width.toFloat() / image.height.coerceAtLeast(1)))
                        }
                        Action(tr("common.close"), secondary = true) { open = false }
                    }
                }
            }
        }
    }
}

@Composable fun PosterProofReviews(api: Api, eventId: String? = null, go: (String) -> Unit = {}) {
    Title(tr("ux.posterProof.queueTitle"), tr("ux.posterProof.queueEmptyBody"))
    var status by rememberSaveable(eventId) { mutableStateOf("PENDING") }
    val mutation = rememberMutation()
    MutationStatus(mutation)
    Tabs(posterProofStatuses.map { it to tr("ux.content.status$it") }, status) { if (!mutation.busy) status = it }
    Remote(api, posterProofQueuePath(status, eventId), pollMs = 15000) { data, reload ->
        val proofs = data.rows("proofs")
        if (proofs.isEmpty()) Empty(
            tr(if (status == "PENDING") "ux.posterProof.queueEmpty" else "ux.content.status$status"),
            tr("ux.posterProof.queueEmptyBody"))
        proofs.forEach { proof ->
            key(proof.text("id"), proof.text("status"), proof.text("submittedAt"), proof.text("imageUrl")) {
                PosterProofReview(api, proof, mutation, reload, go)
            }
        }
    }
}

@Composable private fun PosterProofReview(api: Api, proof: JsonObject, mutation: Mutation, reload: () -> Unit, go: (String) -> Unit) {
    val member = proof.obj("member")
    val event = proof.obj("event")
    val status = proof.text("status")
    var reason by remember { mutableStateOf("") }
    var reasonError by remember { mutableStateOf<String?>(null) }
    var decided by remember { mutableStateOf(false) }
    val approveLabel = tr("ux.posterProof.approve", "xp" to count(proof.number("rewardXp")))
    fun decide(decision: String) {
        reasonError = null
        mutation.run {
            try {
                api.request("POST", "/api/admin/poster-proofs/${query(proof.text("id"))}/decision",
                    posterProofDecisionPayload(decision, reason))
                decided = true
                mutation.notice = if (decision == "APPROVED") "ux.posterProof.approved" else "ux.posterProof.rejected"
                reload()
            } catch (e: ApiFailure) {
                reasonError = e.details.obj("error").obj("fields").text("reason").takeIf { it.isNotBlank() }
                if (e.code in setOf("REQUEST_DECIDED", "NOT_FOUND", "FORBIDDEN")) {
                    decided = true
                    reload()
                }
                throw e
            }
        }
    }
    Tile {
        Text(member.text("fullName"), style = MaterialTheme.typography.titleLarge)
        Text(member.text("nim"), style = MaterialTheme.typography.bodyMedium)
        Text(event.text("title"), style = MaterialTheme.typography.titleMedium)
        Text(event.text("city", event.obj("city").text("name")))
        val statusLabel = when (status) {
            "APPROVED" -> tr("ux.posterProof.statusAPPROVED", "xp" to count(proof.number("xpAwarded")))
            "REJECTED" -> tr("ux.content.statusREJECTED")
            else -> tr("ux.posterProof.statusPENDING")
        }
        Badge(statusLabel, status)
        if (proof.text("imageUrl").isNotBlank()) PosterProofImage(api, proof.text("imageUrl"))
        if (status == "PENDING" && !decided) {
            Field(tr("ux.posterProof.reason"), reason, { reason = it.take(500); reasonError = null }, multiline = true)
            Text(tr("ops.rejectReasonHint"), style = MaterialTheme.typography.bodySmall)
            reasonError?.let { Notice(tr(it), true) }
            Decide(approveLabel, member.text("fullName") + " · " + member.text("nim") + "\n" + event.text("title") + "\n" + approveLabel,
                enabled = !mutation.busy) { decide("APPROVED") }
            Decide(tr("ux.posterProof.reject"), member.text("fullName") + " · " + member.text("nim") + "\n" + event.text("title") + "\n" + reason.trim(),
                enabled = !mutation.busy && reason.trim().length in 3..500, secondary = true) { decide("REJECTED") }
        }
        if (status == "REJECTED") Notice(tr("ux.posterProof.statusREJECTED", "reason" to proof.text("rejectReason")), true)
        if (proof.text("reviewedBy").isNotBlank()) Text(proof.text("reviewedBy"), style = MaterialTheme.typography.bodySmall)
        if (event.text("id").isNotBlank()) Action(tr("ux.notifAction.viewEvent"), !mutation.busy, secondary = true) { go("city-event/${event.text("id")}") }
    }
}
