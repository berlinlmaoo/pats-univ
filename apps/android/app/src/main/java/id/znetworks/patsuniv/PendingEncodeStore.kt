package id.znetworks.patsuniv

import java.io.File
import java.security.MessageDigest
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject

/** A written tag must remain reportable after navigation, process death or an offline retry. */
class PendingEncodeStore(directory: File, origin: String, userId: String, private val cipher: SessionCipher) {
    private val scope = origin.trimEnd('/') + "|" + userId
    private val digest = MessageDigest.getInstance("SHA-256").digest(scope.toByteArray()).joinToString("") { "%02x".format(it) }
    private val file = File(directory, "encode-report-$digest")
    fun load(): JsonObject? {
        if (!file.exists()) return null
        return runCatching { PatsJson.parseToJsonElement(String(cipher.open(file.readBytes()))).jsonObject }
            .getOrElse { file.delete(); null }
    }
    fun save(claim: JsonObject, report: JsonObject) {
        val bytes = cipher.seal(body("claim" to claim, "report" to report).toString().toByteArray())
        file.parentFile?.mkdirs()
        val temporary = File(file.parentFile, file.name + ".tmp")
        temporary.writeBytes(bytes)
        Files.move(temporary.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
    }
    fun clear() { file.delete() }
}
