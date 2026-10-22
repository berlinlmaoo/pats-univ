package id.znetworks.patsuniv

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import java.io.ByteArrayOutputStream
import java.io.File

const val POSTER_PROOF_MAX_BYTES = 5 * 1024 * 1024
fun validPosterProofImage(size: Int, mime: String) = size in 1..POSTER_PROOF_MAX_BYTES && mime in setOf("image/jpeg", "image/png", "image/webp")
fun isPosterProofImagePath(path: String) = Regex("/api/poster-proofs/[A-Za-z0-9-]+/image(?:\\?v=[0-9]+)?").matches(path)
fun canReplacePosterProof(proof: JsonObject) = proof.text("status") != "APPROVED"
fun canSelectJourneyStep(step: JsonObject) = step.text("state") in setOf("done", "current", "optional")
fun maySkipPosterStep(step: JsonObject) = step.text("key") == "poster" && step.flag("optional") && step.text("state") == "optional"

@Composable fun PosterShareStep(api: Api, event: JsonObject, step: JsonObject, mutation: Mutation, onUpdated: (JsonObject) -> Unit, onSkip: () -> Unit) {
    val context = LocalContext.current
    val eventId = event.text("id")
    val proof = step.obj("proof")
    val posterUrl = event.obj("poster").text("url", event.text("flyerUrl"))
    var image by remember(eventId) { mutableStateOf<ByteArray?>(null) }
    var mime by remember(eventId) { mutableStateOf("") }
    var preview by remember(eventId) { mutableStateOf<android.graphics.Bitmap?>(null) }
    var fieldErrors by remember(eventId) { mutableStateOf<JsonObject>(body()) }
    var submitted by remember(eventId) { mutableStateOf(false) }
    val shareTitle = tr("uxMember.sharePoster")
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) mutation.run {
            image = null; mime = ""; preview = null
            fieldErrors = body(); submitted = false
            val type = context.contentResolver.getType(uri).orEmpty()
            if (type !in setOf("image/jpeg", "image/png", "image/webp")) throw TagFailure("validation.flyerType")
            val bytes = withContext(Dispatchers.IO) {
                context.contentResolver.openInputStream(uri)?.use { input ->
                    val output = ByteArrayOutputStream(); val buffer = ByteArray(8192)
                    while (true) {
                        val size = input.read(buffer); if (size < 0) break
                        if (output.size() + size > POSTER_PROOF_MAX_BYTES) throw TagFailure("validation.flyerTooLarge")
                        output.write(buffer, 0, size)
                    }
                    output.toByteArray()
                } ?: throw TagFailure("validation.flyerRequired")
            }
            if (!validPosterProofImage(bytes.size, type)) throw TagFailure("validation.flyerRequired")
            val decoded = withContext(Dispatchers.Default) { decodeMediaBitmap(bytes, maxDimension = 1600) }
                ?: throw TagFailure("validation.flyerType")
            image = bytes; mime = type; preview = decoded
        }
    }
    Badge(tr("ux.journey.optional"))
    Text(tr("ux.journey.posterBody", "xp" to count(step.number("rewardXp"))))
    EventPoster(api, event)
    if (posterUrl.isBlank()) Notice(tr("ux.posterProof.noPoster"))
    else Action(shareTitle, enabled = !mutation.busy, secondary = true) {
        mutation.run {
            val bytes = api.media(posterUrl)
            val uri = withContext(Dispatchers.IO) {
                val decoded = decodeMediaBitmap(bytes, maxDimension = 2400) ?: throw TagFailure("validation.flyerType")
                val file = File(context.cacheDir, "shared-poster.jpg")
                file.outputStream().use { decoded.compress(android.graphics.Bitmap.CompressFormat.JPEG, 95, it) }
                decoded.recycle()
                FileProvider.getUriForFile(context, context.packageName + ".files", file)
            }
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "image/jpeg"; putExtra(Intent.EXTRA_STREAM, uri); putExtra(Intent.EXTRA_TEXT, event.text("title"))
                clipData = android.content.ClipData.newRawUri("poster", uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            context.startActivity(Intent.createChooser(intent, shareTitle))
        }
    }
    when (proof.text("status")) {
        "PENDING" -> Notice(tr("ux.posterProof.statusPENDING"))
        "APPROVED" -> Notice(tr("ux.posterProof.statusAPPROVED", "xp" to count(proof.number("xpAwarded"))))
        "REJECTED" -> Notice(tr("ux.posterProof.statusREJECTED", "reason" to proof.text("rejectReason")), true)
    }
    if (proof.text("imageUrl").isNotBlank()) PosterProofImage(api, proof.text("imageUrl"))
    if (canReplacePosterProof(proof) && posterUrl.isNotBlank()) {
        Text(tr("ux.posterProof.hint"), style = MaterialTheme.typography.bodySmall)
        Action(tr(if (proof.isEmpty()) "ux.posterProof.upload" else "ux.posterProof.replace"), !mutation.busy, secondary = true) { picker.launch("image/*") }
        preview?.let { Image(it.asImageBitmap(), tr("ux.posterProof.upload"), Modifier.fillMaxWidth().heightIn(max = Space.qr)) }
        if (image != null) {
            Action(tr("ux.posterProof.upload"), !mutation.busy) {
                mutation.run {
                    fieldErrors = body()
                    try {
                        val result = api.submitPosterProof(eventId, image!!, mime)
                        image = null; preview = null; submitted = true; onUpdated(result)
                    } catch (e: ApiFailure) { fieldErrors = e.details.obj("error").obj("fields"); throw e }
                }
            }
            Action(tr("social.removeAttachment"), !mutation.busy, secondary = true) { image = null; preview = null }
        }
    }
    fieldErrors.values.forEach { value -> (value as? kotlinx.serialization.json.JsonPrimitive)?.content?.let { Notice(tr(it), true) } }
    MutationStatus(mutation)
    if (submitted && proof.text("status") == "PENDING") Notice(tr("ux.posterProof.submitted"))
    if (maySkipPosterStep(step)) Action(tr("ux.journey.posterSkip"), !mutation.busy, secondary = true, onClick = onSkip)
}
