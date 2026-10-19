package id.znetworks.patsuniv

import android.app.Activity
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.NfcA
import kotlinx.coroutines.*
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class AndroidCardReader(private val activity: Activity) : CardReader {
    private val adapter = NfcAdapter.getDefaultAdapter(activity)
    override fun support() = when { adapter == null -> NfcSupport.UNSUPPORTED; !adapter.isEnabled -> NfcSupport.DISABLED; else -> NfcSupport.READY }
    override suspend fun <T> withTag(block: suspend (TagIo) -> T): T {
        if (support() != NfcSupport.READY) throw TagFailure("nfc.unsupportedBody")
        var technology: NfcA? = null
        try {
            return withTimeout(45000) {
                val seen = AtomicBoolean(false)
                val tag = suspendCancellableCoroutine<Tag> { continuation ->
                    activity.runOnUiThread {
                        if (continuation.isActive) runCatching { adapter!!.enableReaderMode(activity, { tag -> if (seen.compareAndSet(false, true) && continuation.isActive) continuation.resume(tag) }, NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK, null) }.onFailure { if (continuation.isActive) continuation.resumeWithException(TagFailure("nfc.tagLost")) }
                    }
                }
                withContext(Dispatchers.IO) {
                    val nfc = NfcA.get(tag) ?: throw TagFailure("nfc.notNtag")
                    technology = nfc; nfc.connect(); nfc.timeout = 5000
                    val io = object : TagIo {
                        override val uid = hex(tag.id.map { it.toInt() and 255 })
                        override fun transceive(command: Bytes) = nfc.transceive(command.map { it.toByte() }.toByteArray()).map { it.toInt() and 255 }
                    }
                    block(io)
                }
            }
        } catch (_: TimeoutCancellationException) { throw TagFailure("nfc.tagLost") }
        finally { runCatching { technology?.close() }; activity.runOnUiThread { runCatching { adapter?.disableReaderMode(activity) } } }
    }
}
