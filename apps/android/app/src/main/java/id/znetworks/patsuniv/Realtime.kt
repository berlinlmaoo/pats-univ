package id.znetworks.patsuniv

import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.serialization.json.JsonObject
import org.json.JSONObject

/** A room belongs to the visible screen; close on disposal and obtain fresh credentials on re-entry. */
class RealtimeRoom {
    private var socket: Socket? = null
    suspend fun connect(api: Api, kind: String, id: String, changed: () -> Unit, lost: () -> Unit) {
        close()
        val credentials = api.request("GET", "/api/social/token")
        val client = IO.socket(credentials.text("url"), IO.Options().apply {
            auth = mapOf("token" to credentials.text("token"))
            transports = arrayOf("websocket")
            reconnection = true
            callFactory = api.http
            webSocketFactory = api.http
        })
        socket = client
        client.on(Socket.EVENT_CONNECT) {
            client.emit("join", JSONObject().put("kind", kind).put("id", id), io.socket.client.Ack { args ->
                val result = args.firstOrNull() as? JSONObject
                if (result?.optBoolean("ok") == true) changed() else lost()
            })
        }
        client.on("changed") { changed() }
        client.on("access_lost") { close(); lost() }
        client.connect()
    }
    fun send(message: JsonObject, completed: (Boolean) -> Unit) {
        val client = socket
        if (client?.connected() != true) { completed(false); return }
        client.emit("message", JSONObject(message.toString()), io.socket.client.Ack { args -> completed((args.firstOrNull() as? JSONObject)?.optBoolean("ok") == true) })
    }
    fun close() { socket?.off(); socket?.disconnect(); socket = null }
}
