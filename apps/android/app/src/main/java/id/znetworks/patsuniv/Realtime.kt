package id.znetworks.patsuniv

import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.serialization.json.JsonObject
import org.json.JSONObject
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** A room belongs to the visible screen; close on disposal and obtain fresh credentials on re-entry. */
class RealtimeRoom {
    @Volatile private var socket: Socket? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var retry: Job? = null
    private var expiry: Job? = null
    @Volatile private var generation = 0
    private val ready = MutableStateFlow(false)
    val connected = ready.asStateFlow()
    suspend fun connect(api: Api, kind: String, id: String, changed: () -> Unit, lost: () -> Unit) {
        close()
        val current = generation
        suspend fun open() {
        val credentials = api.request("GET", "/api/social/token")
        if (generation != current) return
        socket?.off(); socket?.disconnect()
        val client = IO.socket(credentials.text("url"), IO.Options().apply {
            auth = mapOf("token" to credentials.text("token"))
            transports = arrayOf("websocket")
            reconnection = false
            callFactory = api.http
            webSocketFactory = api.http
        })
        socket = client
        fun reconnect() {
            if (generation != current) return
            retry?.cancel()
            retry = scope.launch {
                while (isActive && generation == current) {
                    delay(3000)
                    try { open(); break } catch(e: CancellationException) { throw e } catch (_: Exception) { }
                }
            }
        }
        client.on(Socket.EVENT_CONNECT) {
            client.emit("join", JSONObject().put("kind", kind).put("id", id), io.socket.client.Ack { args ->
                val result = args.firstOrNull() as? JSONObject
                if (generation == current && result?.optBoolean("ok") == true) {
                    ready.value = true; changed(); expiry?.cancel()
                    result.optString("expiresAt").takeIf { it.isNotBlank() }?.let { iso ->
                        val deadline = runCatching { java.time.Instant.parse(iso).toEpochMilli() }.getOrNull()
                        if (deadline != null) expiry = scope.launch { delay((deadline - System.currentTimeMillis()).coerceAtLeast(0)); if (generation == current) { close(); lost() } }
                    }
                } else if (generation == current) { close(); lost() }
            })
        }
        client.on("changed") { if (generation == current) changed() }
        client.on("access_lost") { if (generation == current) { close(); lost() } }
        client.on(Socket.EVENT_DISCONNECT) { if (generation == current) { ready.value = false; reconnect() } }
        client.on(Socket.EVENT_CONNECT_ERROR) { if (generation == current) { ready.value = false; reconnect() } }
        client.connect()
        }
        try { open() } catch(e: CancellationException) { throw e } catch (_: Exception) {
            retry = scope.launch { while (isActive && generation == current) { delay(3000); try { open(); break } catch(e: CancellationException) { throw e } catch (_: Exception) { } } }
        }
    }
    fun send(message: JsonObject, completed: (Boolean) -> Unit) {
        val client = socket
        if (client?.connected() != true) { completed(false); return }
        client.emit("message", JSONObject(message.toString()), io.socket.client.Ack { args -> completed((args.firstOrNull() as? JSONObject)?.optBoolean("ok") == true) })
    }
    suspend fun sendAwait(message: JsonObject) = withTimeout(10000) {
        suspendCancellableCoroutine<Unit> { continuation ->
            val client = socket
            if (client?.connected() != true) { continuation.resumeWithException(ApiFailure("NETWORK")); return@suspendCancellableCoroutine }
            client.emit("message", JSONObject(message.toString()), io.socket.client.Ack { args ->
                if (continuation.isActive) {
                    val result = args.firstOrNull() as? JSONObject
                    if (result?.optBoolean("ok") == true) continuation.resume(Unit)
                    else continuation.resumeWithException(ApiFailure(result?.optString("error", "INTERNAL") ?: "INTERNAL"))
                }
            })
        }
    }
    fun close() { generation++; retry?.cancel(); retry = null; expiry?.cancel(); expiry = null; ready.value = false; socket?.off(); socket?.disconnect(); socket = null }
}
