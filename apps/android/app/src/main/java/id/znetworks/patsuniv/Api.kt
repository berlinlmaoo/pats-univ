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
    internal val origin get() = base
    internal val userId get() = store.current?.me?.obj("user")?.text("id").orEmpty()
    val joinUrl get() = base.trimEnd('/') + "/join"
    internal val http = OkHttpClient.Builder().callTimeout(30, TimeUnit.SECONDS).followRedirects(false).apply {
        if (BuildConfig.DEBUG && BuildConfig.DEV_IP.isNotBlank()) dns { host ->
            if (host == URI(base).host) listOf(InetAddress.getByName(BuildConfig.DEV_IP)) else Dns.SYSTEM.lookup(host)
        }
    }.build()
    private val refreshLock = Mutex()
    suspend fun request(method: String, path: String, payload: JsonObject? = null, authenticated: Boolean = true): JsonObject {
        val token = if (authenticated) accessToken() else null
        return try { raw(method, path, payload, token) } catch (e: ApiFailure) {
            if (authenticated) clearRejectedSession(token, e)
            throw e
        }
    }
    private fun clearRejectedSession(token: String?, failure: ApiFailure) {
        if (failure.code in setOf("UNAUTHENTICATED", "ACCOUNT_DISABLED") && store.current?.tokens?.accessToken == token) store.clear()
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
    suspend fun saveEventContent(eventId: String, description: String, poster: ByteArray?, contentType: String): JsonObject {
        if (poster == null) return request("POST", "/api/admin/events/${query(eventId)}/content", body("description" to description))
        require(poster.isNotEmpty() && poster.size <= 5 * 1024 * 1024 && contentType in setOf("image/jpeg", "image/png", "image/webp"))
        val token = accessToken()
        return withContext(Dispatchers.IO) {
            val form = MultipartBody.Builder().setType(MultipartBody.FORM).addFormDataPart("description", description)
                .addFormDataPart("poster", "poster." + if (contentType == "image/png") "png" else if (contentType == "image/webp") "webp" else "jpg", poster.toRequestBody(contentType.toMediaType())).build()
            val request = Request.Builder().url(base.trimEnd('/') + "/api/admin/events/${query(eventId)}/content").header("Authorization", "Bearer $token").post(form).build()
            try { http.newCall(request).execute().use { response ->
                val parsed = runCatching { PatsJson.parseToJsonElement(response.body.string()).jsonObject }.getOrDefault(body())
                if (!response.isSuccessful) throw ApiFailure(parsed.obj("error").text("code", "INTERNAL"), parsed)
                parsed
            } } catch (e: ApiFailure) { clearRejectedSession(token, e); throw e } catch (e: IOException) { throw ApiFailure("NETWORK") }
        }
    }
    /** Only this same-origin, staff-only route receives bearer auth; signed media stays credential-free. */
    suspend fun staffPoster(path: String): ByteArray {
        require(Regex("/api/admin/content-submissions/[A-Za-z0-9-]+/poster").matches(path))
        val token = accessToken()
        return withContext(Dispatchers.IO) {
            val request = Request.Builder().url(base.trimEnd('/') + path).header("Authorization", "Bearer $token").build()
            try { http.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    val parsed = runCatching { PatsJson.parseToJsonElement(response.body.string()).jsonObject }.getOrDefault(body())
                    throw ApiFailure(parsed.obj("error").text("code", "MEDIA_INVALID"), parsed)
                }
                response.body.bytes()
            } } catch (e: ApiFailure) { clearRejectedSession(token, e); throw e } catch (e: IOException) { throw ApiFailure("NETWORK") }
        }
    }
    suspend fun reload() {
        val original = store.current ?: return
        val fresh = request("GET", "/api/me")
        store.current?.takeIf { it.me.obj("user").text("id") == original.me.obj("user").text("id") }?.let { store.save(it.copy(me = fresh)) }
    }
    suspend fun uploadPhoto(bytes: ByteArray, contentType: String) {
        val token = accessToken()
        withContext(Dispatchers.IO) {
            val req = Request.Builder().url(base.trimEnd('/') + "/api/me/photo").header("Authorization", "Bearer " + token).put(bytes.toRequestBody(contentType.toMediaType())).build()
            http.newCall(req).execute().use { res ->
                if(!res.isSuccessful) {
                    val parsed = runCatching { PatsJson.parseToJsonElement(res.body.string()).jsonObject }.getOrDefault(body())
                    throw ApiFailure(parsed.obj("error").text("code", "INTERNAL"), parsed)
                }
            }
        }
        reload()
    }
    suspend fun signOut() {
        val previous = store.current
        store.clear()
        previous?.let { runCatching { request("POST", "/api/auth/logout", body("refreshToken" to it.tokens.refreshToken), false) } }
    }
    /** Signed media requests never carry bearer credentials, even when storage has another origin. */
    suspend fun media(url: String, bytes: ByteArray? = null, contentType: String = "image/jpeg"): ByteArray = withContext(Dispatchers.IO) {
        var target = if (url.startsWith("/")) base.trimEnd('/') + url else url
        // The demo server's APP_URL still names the unavailable canonical host. Signatures cover
        // the path/query, so debug can reach that same storage route on the configured dev origin.
        val parsed = URI(target)
        if (BuildConfig.DEBUG && parsed.host == "patsuniv.znetworks.id" && URI(base).host != parsed.host && parsed.path in setOf("/api/loyalty/receipt-file", "/api/social/media-file", "/api/photos/file")) target = base.trimEnd('/') + parsed.rawPath + "?" + parsed.rawQuery
        val request = Request.Builder().url(target).apply { if (bytes != null) put(bytes.toRequestBody(contentType.toMediaType())) }.build()
        try { http.newCall(request).execute().use { response -> if (!response.isSuccessful) throw ApiFailure("MEDIA_INVALID"); response.body.bytes() } }
        catch(e: ApiFailure) { throw e } catch(e: IOException) { throw ApiFailure("NETWORK") }
    }
}
