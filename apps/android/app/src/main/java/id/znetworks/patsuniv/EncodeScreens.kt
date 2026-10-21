package id.znetworks.patsuniv

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import kotlinx.coroutines.*
import kotlinx.serialization.json.*
import java.util.concurrent.atomic.AtomicBoolean

fun validCardLookup(value: String) = cardToken(value) != null || Regex("^[A-Za-z0-9_-]{32}$").matches(value.trim()) || Regex("^[A-Z]{3}[0-9]{7}$").matches(value.uppercase().replace(Regex("\\s"), ""))
@Composable fun EncodeHome(api: Api, go: (String) -> Unit) {
    Title(tr("app.adminEncode"), tr("app.encodeIntro"))
    Action(tr("app.encodeAnyCard")) { go("encode-run") }
    Remote(api, "/api/hq/batches", pollMs = 10000) { data, _ ->
        if (data.rows("batches").isEmpty()) Empty(tr("app.encodeNoBatchTitle"), tr("app.encodeNoBatchBody"))
        data.rows("batches").forEach { batch -> Tile {
            Text(batch.text("label"), style = MaterialTheme.typography.titleLarge); Text(batch.obj("city").text("name")); Text(tr("app.encodeProgress", "label" to batch.text("label"), "done" to count(batch.number("encodedCount")), "total" to count(batch.number("cardCount")))); Text(tr("batchStatus." + batch.text("status")))
            LinearProgressIndicator(progress = { batch.number("encodedCount").toFloat() / batch.number("cardCount").coerceAtLeast(1) })
            Action(tr("app.adminEncode"), secondary = true) { go("encode-run/" + batch.text("id")) }
        } }
    }
}
@Composable fun EncodeRun(api: Api, reader: CardReader, batchId: String = "", grantId: String = "", initialLookup: String = "", go: (String) -> Unit = {}) {
    Title(tr(if (grantId.isNotEmpty()) "app.reencodeNow" else "app.adminEncode"), tr("app.encodeIdentify"))
    val context = androidx.compose.ui.platform.LocalContext.current
    val station = remember { val prefs = context.getSharedPreferences("station", 0); val id = prefs.getString("id", null) ?: java.util.UUID.randomUUID().toString().take(8).also { prefs.edit().putString("id", it).apply() }; (android.os.Build.MODEL.take(40) + " · " + id).take(60) }
    val mutation = rememberMutation(); MutationStatus(mutation)
    StaffTaskGuard(mutation.busy)
    // Protect the lease through the blocking write and persisted-but-unreported result.
    val writingTag = remember { AtomicBoolean(false) }
    val reports = remember(api.origin, api.userId) { PendingEncodeStore(context.noBackupFilesDir, api.origin, api.userId, KeystoreSessionCipher()) }
    val restored = remember(reports) { reports.load() }
    var support by remember(reader) { mutableStateOf(reader.support()) }
    androidx.lifecycle.compose.LifecycleResumeEffect(reader) { support = reader.support(); onPauseOrDispose { } }
    var lookup by remember { mutableStateOf(initialLookup) }; var reencode by remember { mutableStateOf(grantId.isNotBlank()) }; var scanning by remember { mutableStateOf(false) }
    var claim by remember(reports) { mutableStateOf(restored?.obj("claim")) }; var pending by remember(reports) { mutableStateOf(restored?.obj("report")) }; var result by remember { mutableStateOf<JsonObject?>(null) }
    val latestClaim by rememberUpdatedState(claim); val latestPending by rememberUpdatedState(pending); val latestResult by rememberUpdatedState(result)
    val scope = rememberCoroutineScope()
    suspend fun release(held: JsonObject, failure: String? = null) { if (held.obj("lease").isNotEmpty()) runCatching { api.request("POST", "/api/hq/cards/${held.obj("card").text("id")}/release", JsonObject(body("leaseId" to held.obj("lease").text("id")) + (failure?.let { mapOf("failure" to JsonPrimitive(it)) } ?: emptyMap()))) } }
    fun identify(value: String) { mutation.run {
        if (reader.support() != NfcSupport.READY) throw TagFailure(if (reader.support() == NfcSupport.UNSUPPORTED) "uxAdmin.nfcCrewPhone" else "nfc.disabledBody")
        val fields = body("lookup" to value.trim(), "station" to station, "mode" to if (reencode) "reencode" else "encode")
        claim = api.request("POST", "/api/hq/cards/prepare", JsonObject(fields + (if (batchId.isNotBlank()) mapOf("batchId" to JsonPrimitive(batchId)) else emptyMap()) + (if (grantId.isNotBlank()) mapOf("grantId" to JsonPrimitive(grantId)) else emptyMap())))
        scanning = false
    } }
    suspend fun report(held: JsonObject, data: JsonObject) { result = api.request("POST", "/api/hq/cards/${held.obj("card").text("id")}/encoded", data); reports.clear(); pending = null; writingTag.set(false) }
    DisposableEffect(Unit) { onDispose { val held = latestClaim; if (held != null && latestPending == null && latestResult == null && !writingTag.get()) scope.launch(NonCancellable + Dispatchers.IO) { release(held) } } }
    LaunchedEffect(initialLookup, support) { if (initialLookup.isNotBlank() && claim == null && support == NfcSupport.READY) identify(initialLookup) }
    val held = claim
    if (held == null) {
        if (support != NfcSupport.READY) {
            NfcAction(reader, "app.encodeTap", mutation.busy, returnToCards = { go("tools") }) { }
            return
        }
        if (grantId.isEmpty()) Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.gap)) { Switch(reencode, { reencode = it }); Text(tr("app.encodeReencode")) }
        Field(tr("app.encodeNim"), lookup, { lookup = it })
        Action(tr("app.encodeFind"), validCardLookup(lookup) && !mutation.busy) { identify(lookup) }
        Action(tr("app.encodeScanQr"), !mutation.busy, true) { scanning = !scanning }
        if (scanning) QrScanner { if (validCardLookup(it)) identify(it) else { scanning = false; mutation.run { throw ApiFailure("CARD_INVALID") } } }
    } else {
        Who(api, held.obj("member"))
        if (result != null) {
            Notice(tr("app.encodeDone")); Text(result!!.obj("card").text("chipType")); Text(result!!.obj("card").text("nfcUid"))
            Action(tr("app.encodeNext")) { claim = null; pending = null; result = null; lookup = "" }
        } else if (pending != null) {
            Notice(tr("nfc.reportFailed"), true)
            Action(tr("app.encodeReportAgain"), !mutation.busy) { mutation.run { report(held, pending!!) } }
        } else if (held.obj("lease").isEmpty()) {
            Notice(tr("app.encodeAlready", "station" to held.obj("card").text("encodedStation")))
            Action(tr("app.encodeNext")) { claim = null; lookup = "" }
        } else {
            Text(tr("app.encodeCheckName")); Text(held.obj("card").obj("batch").text("label"))
            NfcAction(reader, "app.encodeTap", mutation.busy, returnToCards = { go("tools") }) { mutation.run {
                try {
                    val data = reader.withTag { io ->
                        val inspection = Ntag.inspect(io)
                        val existing = cardToken(inspection.url.orEmpty())
                        if (existing != null && !held.text("url").endsWith(existing) && !reencode) throw ApiFailure("UID_IN_USE")
                        val key = api.request("POST", "/api/hq/cards/${held.obj("card").text("id")}/key", body("leaseId" to held.obj("lease").text("id"), "nfcUid" to inspection.uid))
                        writingTag.set(true)
                        try {
                            currentCoroutineContext().ensureActive()
                            val write = Ntag.encode(io, inspection, key.text("url"), unhex(key.text("pwd")), unhex(key.text("pack")))
                            body("leaseId" to held.obj("lease").text("id"), "nfcUid" to inspection.uid, "protectedNow" to write.protectedNow, "chipType" to inspection.chip.name).also { pending = it; reports.save(held, it) }
                        } finally { if (pending == null) writingTag.set(false) }
                    }
                    report(held, data)
                } catch(e: CancellationException) { throw e }
                catch(e: Exception) { if (pending == null) { release(held, (e as? TagFailure)?.key); claim = null }; throw e }
            } }
            Action(tr("app.encodeNotThisCard"), !mutation.busy, true) { mutation.run { release(held); claim = null; lookup = "" } }
        }
    }
}
