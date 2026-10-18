package id.znetworks.patsuniv

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit
import java.net.InetAddress
import java.net.URI

class ApiFailure(val code: String, val details: JsonObject = body()) : IOException(code)

class Api(private val store: SessionStore, private val base: String = BuildConfig.API_URL) {
    internal val http = OkHttpClient.Builder().callTimeout(30, TimeUnit.SECONDS).followRedirects(false).apply {
        if (BuildConfig.DEBUG && BuildConfig.DEV_IP.isNotBlank()) dns { host ->
            if (host == URI(base).host) listOf(InetAddress.getByName(BuildConfig.DEV_IP)) else Dns.SYSTEM.lookup(host)
        }
    }.build()
    private val refreshLock = Mutex()
    suspend fun request(method: String, path: String, payload: JsonObject? = null, authenticated: Boolean = true): JsonObject {
        val token = if (authenticated) accessToken() else null
        return try { raw(method, path, payload, token) } catch (e: ApiFailure) {
            if (authenticated && e.code in setOf("UNAUTHENTICATED", "ACCOUNT_DISABLED")) {
                if (store.current?.tokens?.accessToken == token) store.clear()
            }
            throw e
        }
    }
    private suspend fun accessToken(): String = refreshLock.withLock {
        val current = store.current ?: throw ApiFailure("UNAUTHENTICATED")
        if (!current.tokens.needsRefresh()) return@withLock current.tokens.accessToken
        try {
            val response = raw("POST", "/api/auth/refresh", body("refreshToken" to current.tokens.refreshToken), null)
            val tokens = PatsJson.decodeFromJsonElement<Tokens>(response)
            if (store.current?.tokens?.refreshToken != current.tokens.refreshToken) throw ApiFailure("UNAUTHENTICATED")
            store.save(current.copy(tokens = tokens))
            tokens.accessToken
        } catch (e: ApiFailure) {
            if (e.code in setOf("UNAUTHENTICATED", "ACCOUNT_DISABLED")) store.clear()
            throw e
        }
    }
    private suspend fun raw(method: String, path: String, payload: JsonObject?, token: String?): JsonObject = withContext(Dispatchers.IO) {
        require(path.startsWith("/api/") && !path.contains(".."))
        val req = Request.Builder().url(base.trimEnd('/') + path).header("Accept", "application/json")
            .apply {
                if (token != null) header("Authorization", "Bearer $token")
                method(method, if (method in setOf("GET", "HEAD")) null else (payload ?: body()).toString().toRequestBody("application/json".toMediaType()))
            }.build()
        try {
            http.newCall(req).execute().use { res ->
                val raw = res.body.string()
                val parsed = runCatching { PatsJson.parseToJsonElement(raw) as JsonObject }.getOrNull()
                if (!res.isSuccessful) throw ApiFailure(parsed?.obj("error")?.text("code", "INTERNAL") ?: "INTERNAL", parsed ?: body())
                parsed ?: throw ApiFailure("INTERNAL")
            }
        } catch (e: ApiFailure) { throw e } catch (e: IOException) { throw ApiFailure("NETWORK") }
    }
    suspend fun signIn(email: String, code: String) {
        require(validEmail(email) && validOtp(code))
        val response = request("POST", "/api/auth/otp/verify", body("email" to email.trim(), "code" to code, "client" to "app"), false)
        store.save(Session(PatsJson.decodeFromJsonElement<Tokens>(response), response.obj("me")))
    }
    suspend fun reload() {
        val original = store.current ?: return
        val fresh = request("GET", "/api/me")
        store.current?.takeIf { it.me.obj("user").text("id") == original.me.obj("user").text("id") }?.let { store.save(it.copy(me = fresh)) }
    }
    suspend fun signOut() {
        val previous = store.current
        store.clear()
        previous?.let { runCatching { request("POST", "/api/auth/logout", body("refreshToken" to it.tokens.refreshToken), false) } }
    }
}
