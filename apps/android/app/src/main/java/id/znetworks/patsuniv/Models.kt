package id.znetworks.patsuniv

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import java.time.Instant

val PatsJson = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false; encodeDefaults = true }
fun JsonObject.text(key: String, fallback: String = "") = (get(key) as? JsonPrimitive)?.contentOrNull ?: fallback
fun JsonObject.obj(key: String) = get(key) as? JsonObject ?: JsonObject(emptyMap())
fun JsonObject.rows(key: String) = (get(key) as? JsonArray)?.mapNotNull { it as? JsonObject }.orEmpty()
fun JsonObject.flag(key: String) = (get(key) as? JsonPrimitive)?.booleanOrNull == true
fun JsonObject.number(key: String) = (get(key) as? JsonPrimitive)?.intOrNull ?: 0
fun body(vararg values: Pair<String, Any?>): JsonObject = buildJsonObject {
    values.forEach { (key, value) -> put(key, when (value) {
        null -> JsonNull
        is JsonElement -> value
        is Boolean -> JsonPrimitive(value)
        is Number -> JsonPrimitive(value)
        else -> JsonPrimitive(value.toString())
    }) }
}
@Serializable data class Tokens(val accessToken: String, val accessTokenExpiresAt: String, val refreshToken: String) {
    fun needsRefresh(now: Long = System.currentTimeMillis()) = runCatching { Instant.parse(accessTokenExpiresAt).toEpochMilli() - now <= 30_000 }.getOrDefault(true)
}
@Serializable data class Session(val tokens: Tokens, val me: JsonObject)
fun cardToken(input: String): String? = Regex("/c/([A-Za-z0-9_-]{32})(?:[/?#]|$)").find(input.trim())?.groupValues?.get(1)
fun validEmail(input: String) = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").matches(input.trim())
fun validOtp(input: String) = Regex("^[0-9]{6}$").matches(input)
fun errorKey(code: String): String {
    val special = mapOf("VALIDATION" to "validation.invalid", "INTERNAL" to "errors.generic", "INSUFFICIENT_XP" to "loyalty.insufficientXp", "REDEEM_USED" to "loyalty.codeUsed", "REDEEM_EXPIRED" to "loyalty.codeExpired")
    return special[code] ?: "errors." + code.lowercase().split('_').mapIndexed { i, word -> if (i == 0) word else word.replaceFirstChar { it.uppercase() } }.joinToString("")
}
