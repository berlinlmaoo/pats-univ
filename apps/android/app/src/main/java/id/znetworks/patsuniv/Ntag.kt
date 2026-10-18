package id.znetworks.patsuniv

import java.io.IOException

typealias Bytes = List<Int>
interface TagIo { val uid: String?; fun transceive(command: Bytes): Bytes }
enum class NfcSupport { READY, DISABLED, UNSUPPORTED }
interface CardReader { fun support(): NfcSupport; suspend fun <T> withTag(block: suspend (TagIo) -> T): T }
class TagFailure(val key: String) : IOException(key)
data class Chip(val name: String, val storage: Int, val ccSize: Int, val userEnd: Int) {
    val userBytes get() = (userEnd - 3) * 4
    val dynamicLock get() = userEnd + 1
    val cfg0 get() = userEnd + 2
    val cfg1 get() = userEnd + 3
    val pwd get() = userEnd + 4
    val pack get() = userEnd + 5
}
data class TagInspection(val chip: Chip, val uid: String, val auth0: Int, val access: Int, val cfg: Bytes, val user: Bytes, val offset: Int, val url: String?) { val protected get() = auth0 <= chip.userEnd }
data class TagWrite(val protectedNow: Boolean, val pagesWritten: Int)
data class TagPage(val page: Int, val data: Bytes)
data class NdefLayout(val pages: List<TagPage>, val empty: List<TagPage>, val header: List<TagPage>, val body: List<TagPage>)
fun hex(bytes: Bytes) = bytes.joinToString("") { "%02X".format(it) }
fun unhex(value: String): Bytes { val clean = value.replace(Regex("[\\s:]"), ""); require(Regex("(?:[0-9a-fA-F]{2})*").matches(clean)); return clean.chunked(2).map { it.toInt(16) } }

/** Raw Type 2 commands. Lock bits and the capability container are never written. */
object Ntag {
    val chips = listOf(Chip("NTAG213", 0x0f, 0x12, 0x27), Chip("NTAG215", 0x11, 0x3e, 0x81), Chip("NTAG216", 0x13, 0x6d, 0xe1))
    fun chip(version: Bytes): Chip? = if (version.size >= 8 && version.take(6) == listOf(0, 4, 4, 2, 1, 0) && version[7] == 3) chips.find { it.storage == version[6] } else null
    private fun send(io: TagIo, command: Bytes): Bytes = try { io.transceive(command) } catch (_: Exception) { throw TagFailure("nfc.tagLost") }
    private fun read(io: TagIo, page: Int): Bytes { val bytes = send(io, listOf(0x30, page)); if (bytes.size < 16) throw TagFailure("nfc.tagLost"); return bytes.take(16) }
    private fun write(io: TagIo, page: Int, data: Bytes) {
        require(data.size == 4)
        repeat(3) { val result = runCatching { io.transceive(listOf(0xa2, page) + data) }.getOrNull(); if (result != null && (result.isEmpty() || result.size == 1 && result[0] and 0x0f == 0x0a)) return }
        throw TagFailure("nfc.writeFailed")
    }
    fun uriTlv(url: String): Bytes {
        val prefix = when { url.startsWith("https://") -> "https://" to 4; url.startsWith("http://") -> "http://" to 3; else -> "" to 0 }
        val rest = url.removePrefix(prefix.first).map { it.code }
        require(rest.all { it in 33..126 })
        val record = listOf(0xd1, 1, rest.size + 1, 0x55, prefix.second) + rest
        require(record.size <= 254)
        return listOf(3, record.size) + record + 0xfe
    }
    fun offset(user: Bytes): Int {
        var i = 0
        while (i < user.size) {
            when(user[i]) {
                0 -> i++
                1, 2 -> { val length = user.getOrNull(i + 1) ?: return 0; if (length == 255 || i + length + 2 > user.size) return 0; i += length + 2 }
                else -> return i
            }
        }
        return 0
    }
    fun uri(user: Bytes): String? = runCatching {
        var i = 0
        while (i < user.size) {
            val type = user[i]
            if (type == 0) { i++; continue }
            if (type == 0xfe) return null
            var length = user[i + 1]; var start = i + 2
            if (length == 255) { length = user[i + 2] * 256 + user[i + 3]; start = i + 4 }
            if (type != 3) { i = start + length; continue }
            if (length == 0 || start + length > user.size) return null
            val msg = user.subList(start, start + length); val header = msg[0]; val short = header and 0x10 != 0; val hasId = header and 8 != 0
            var p = 2; val payloadLength = if (short) msg[p++] else { val n = msg[p] * 16777216 + msg[p + 1] * 65536 + msg[p + 2] * 256 + msg[p + 3]; p += 4; n }
            val idLength = if (hasId) msg[p++] else 0; val typeLength = msg[1]
            if (header and 7 != 1 || typeLength != 1 || msg[p] != 0x55) return null
            p += typeLength + idLength
            if (payloadLength < 1 || p + payloadLength > msg.size) return null
            val prefix = when(msg[p]) { 0 -> ""; 3 -> "http://"; 4 -> "https://"; else -> return null }
            return prefix + msg.subList(p + 1, p + payloadLength).map { it.toChar() }.joinToString("")
        }
        null
    }.getOrNull()
    private fun pages(bytes: Bytes): List<TagPage> = bytes.chunked(4).mapIndexed { i, row -> TagPage(4 + i, row + List(4 - row.size) { 0 }) }
    fun layout(url: String, prefix: Bytes, chip: Chip): NdefLayout {
        val tlv = uriTlv(url); require(prefix.size + tlv.size <= chip.userBytes)
        val first = 4 + prefix.size / 4
        val all = pages(prefix + tlv).filter { it.page >= first }
        val headers = setOf(first, 4 + (prefix.size + 1) / 4)
        return NdefLayout(all, pages(prefix + listOf(3, 0, 0xfe)).filter { it.page >= first }, all.filter { it.page in headers }, all.filter { it.page !in headers })
    }
    fun inspect(io: TagIo): TagInspection {
        val chip = chip(send(io, listOf(0x60))) ?: throw TagFailure("nfc.notNtag")
        val head = read(io, 0); val uid = hex(head.take(3) + head.subList(4, 8))
        if (io.uid != null && io.uid != uid) throw TagFailure("nfc.readFailed")
        val cc = head.subList(12, 16)
        if (cc[0] != 0xe1 || cc[1] != 0x10) throw TagFailure("nfc.notFormatted")
        if (cc[2] != chip.ccSize) throw TagFailure("nfc.notNtag")
        if (cc[3] != 0) throw TagFailure("nfc.readOnly")
        val cfg = read(io, chip.dynamicLock)
        if (head[10] != 0 || head[11] != 0 || cfg.take(3).any { it != 0 }) throw TagFailure("nfc.locked")
        val user = mutableListOf<Int>()
        for (page in 4..chip.userEnd step 4) { val chunk = read(io, page); user += chunk.take(minOf(16, (chip.userEnd - page + 1) * 4)); if (0xfe in chunk) break }
        return TagInspection(chip, uid, cfg[7], cfg[8], cfg, user, offset(user), uri(user))
    }
    fun encode(io: TagIo, tag: TagInspection, url: String, pwd: Bytes, pack: Bytes): TagWrite {
        require(pwd.size == 4 && pack.size == 2)
        val chip = tag.chip
        fun auth() = runCatching { send(io, listOf(0x1b) + pwd).take(2) == pack }.getOrDefault(false)
        if (tag.protected && !auth()) throw TagFailure("nfc.wrongPassword")
        val layout = layout(url, tag.user.take(tag.offset), chip)
        (layout.empty + layout.body + layout.header).forEach { write(io, it.page, it.data) }
        var written = layout.empty.size + layout.pages.size
        for (attempt in 0..1) {
            val bad = mutableListOf<TagPage>()
            layout.pages.chunked(4).forEach { group -> val chunk = read(io, group.first().page); group.forEachIndexed { j, p -> if (chunk.subList(j * 4, j * 4 + 4) != p.data) bad += p } }
            if (bad.isEmpty()) break
            if (attempt == 1) throw TagFailure("nfc.verifyFailed")
            bad.forEach { write(io, it.page, it.data) }; written += bad.size
        }
        val cfg0 = tag.cfg.subList(4, 8); val cfg1 = listOf(0) + tag.cfg.subList(9, 12)
        fun auth0(value: Int) = cfg0.take(3) + value
        var protectedNow = false
        if (!tag.protected) {
            if (tag.auth0 != 255) {
                if (tag.auth0 > chip.cfg0) { write(io, chip.cfg0, auth0(255)); written++ }
                else if (!auth()) throw TagFailure("nfc.wrongPassword")
            }
            write(io, chip.pwd, pwd); write(io, chip.pack, pack + listOf(0, 0)); write(io, chip.cfg1, cfg1); write(io, chip.cfg0, auth0(chip.pack)); written += 4
            if (!auth()) { runCatching { write(io, chip.cfg0, auth0(255)) }; throw TagFailure("nfc.protectFailed") }
            write(io, chip.cfg0, auth0(4)); written++; protectedNow = true
        } else if (tag.auth0 != 4 || tag.access != 0) { write(io, chip.cfg1, cfg1); write(io, chip.cfg0, auth0(4)); written += 2 }
        val after = read(io, chip.dynamicLock)
        if (after[7] != 4 || after[8] != 0) throw TagFailure("nfc.verifyFailed")
        return TagWrite(protectedNow, written)
    }
}
