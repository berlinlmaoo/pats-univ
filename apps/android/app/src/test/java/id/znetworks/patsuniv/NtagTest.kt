package id.znetworks.patsuniv

import org.junit.Test
import org.junit.Assert.*
import kotlinx.serialization.json.*
import kotlinx.coroutines.runBlocking

/** A tag enforces authentication and refuses all writes to lock/CC pages. */
class MemoryTag(val chip: Chip) : TagIo {
    override val uid = "04A1B2C3D4E5F6"
    val memory = MutableList((chip.pack + 1) * 4) { 0 }
    val commands = mutableListOf<Bytes>()
    var authenticated = false
    var failAfter: Int? = null
    var badPack = false
    init {
        val u = unhex(uid); val head = u.take(3) + (0x88 xor u[0] xor u[1] xor u[2]) + u.drop(3) + (u[3] xor u[4] xor u[5] xor u[6]) + listOf(0x48, 0, 0)
        head.forEachIndexed { i, b -> memory[i] = b }
        listOf(0xe1, 0x10, chip.ccSize, 0).forEachIndexed { i, b -> memory[12 + i] = b }
        val tlv = if (chip.name == "NTAG213") listOf(1, 3, 0xa0, 0x0c, 0x34) else listOf(1, 3, 0xa0, 0x10, 0x44)
        (tlv + listOf(3, 0, 0xfe)).forEachIndexed { i, b -> memory[16 + i] = b }
        listOf(4, 0, 0, 255).forEachIndexed { i, b -> memory[chip.cfg0 * 4 + i] = b }
        repeat(4) { memory[chip.pwd * 4 + it] = 255 }
    }
    private fun page(n: Int) = memory.subList(n * 4, n * 4 + 4).toList()
    override fun transceive(command: Bytes): Bytes {
        commands += command.toList()
        if (failAfter?.let { commands.size >= it } == true) error("Tag removed")
        return when(command[0]) {
            0x60 -> listOf(0, 4, 4, 2, 1, 0, chip.storage, 3)
            0x30 -> (0..3).flatMap { val p = (command[1] + it) % (chip.pack + 1); if (p == chip.pwd || p == chip.pack) listOf(0, 0, 0, 0) else page(p) }
            0xa2 -> {
                val p = command[1]
                check(p >= 4 && p != chip.dynamicLock) { "Lock/CC write forbidden" }
                if (p >= memory[chip.cfg0 * 4 + 3] && !authenticated) listOf(0)
                else { command.drop(2).forEachIndexed { i, b -> memory[p * 4 + i] = b }; listOf(0x0a) }
            }
            0x1b -> if (command.drop(1) == page(chip.pwd)) { authenticated = true; if (badPack) listOf(0, 0) else page(chip.pack).take(2) } else listOf(0)
            else -> listOf(0)
        }
    }
    fun reset() { authenticated = false; failAfter = null }
}
class NtagTest {
    private val url = "https://patsuniv.znetworks.id/c/AbCdEfGhIjKlMnOpQrStUvWxYz012345"
    private val pwd = unhex("12345678"); private val pack = unhex("ABCD")
    @Test fun allChipsMatchTheSharedPhoneAndStationCommandFixture() {
        val fixtures = PatsJson.parseToJsonElement(javaClass.getResource("/encode.json")!!.readText()).jsonArray
        fixtures.forEach { entry ->
            val fixture = entry.jsonObject; val chip = Ntag.chips.first { it.name == fixture.text("chip") }; val tag = MemoryTag(chip)
            if (fixture.flag("protected")) { Ntag.encode(tag, Ntag.inspect(tag), fixture.text("url"), pwd, pack); tag.reset(); tag.commands.clear() }
            val inspection = Ntag.inspect(tag); val factory = tag.memory.take(21)
            val target = fixture.text("url2", fixture.text("url"))
            Ntag.encode(tag, inspection, target, pwd, pack)
            assertEquals(fixture.text("name"), fixture["commands"]!!.jsonArray.map { it.jsonPrimitive.content }, tag.commands.map(::hex))
            assertEquals(factory, tag.memory.take(21)); assertEquals(4, tag.memory[chip.cfg0 * 4 + 3]); assertEquals(0, tag.memory[chip.cfg1 * 4]); assertEquals(target, Ntag.uri(tag.memory.drop(16)))
        }
    }
    @Test fun interruptionAtEveryCommandIsRecoverableWithoutTouchingLocks() {
        Ntag.chips.forEach { chip ->
            val complete = MemoryTag(chip); Ntag.encode(complete, Ntag.inspect(complete), url, pwd, pack)
            for (failureAt in 1..complete.commands.size) {
                val tag = MemoryTag(chip); val factory = tag.memory.take(21); tag.failAfter = failureAt
                runCatching { Ntag.encode(tag, Ntag.inspect(tag), url, pwd, pack) }
                tag.reset(); Ntag.encode(tag, Ntag.inspect(tag), url, pwd, pack)
                assertEquals("${chip.name} command $failureAt", factory, tag.memory.take(21)); assertEquals(url, Ntag.uri(tag.memory.drop(16))); assertEquals(4, tag.memory[chip.cfg0 * 4 + 3])
            }
        }
    }
    @Test fun wrongPasswordIsRejectedBeforeWritingAndFailedProofRollsBack() {
        val tag = MemoryTag(Ntag.chips[0]); Ntag.encode(tag, Ntag.inspect(tag), url, pwd, pack); tag.reset(); val before = tag.memory.toList()
        try { Ntag.encode(tag, Ntag.inspect(tag), url, listOf(0, 0, 0, 0), pack); fail("Expected refusal") } catch(e: TagFailure) { assertEquals("nfc.wrongPassword", e.key) }
        assertEquals(before, tag.memory)
        val blank = MemoryTag(Ntag.chips[1]); blank.badPack = true
        try { Ntag.encode(blank, Ntag.inspect(blank), url, pwd, pack); fail("Expected proof failure") } catch(e: TagFailure) { assertEquals("nfc.protectFailed", e.key) }
        assertEquals(255, blank.memory[blank.chip.cfg0 * 4 + 3])
    }
    @Test fun malformedNdefAndUnsupportedOrLockedChipsAreRejected() {
        assertNull(Ntag.uri(listOf(3, 50, 0xd1))); assertNull(Ntag.chip(listOf(0, 4, 4, 2, 1, 0, 0xff, 3)))
        val tag = MemoryTag(Ntag.chips[0]); tag.memory[10] = 1
        try { Ntag.inspect(tag); fail("Expected locked tag") } catch(e: TagFailure) { assertEquals("nfc.locked", e.key) }
        assertEquals("http://example.test", Ntag.uri(Ntag.uriTlv("http://example.test")))
        assertThrows(IllegalArgumentException::class.java) { Ntag.uriTlv("https://example.test/é") }
        assertThrows(IllegalArgumentException::class.java) { Ntag.layout("https://example.test/" + "a".repeat(200), emptyList(), Ntag.chips[0]) }
    }
    @Test fun readerInterfaceHasAnExecutableFake() = runBlocking {
        val reader = object : CardReader {
            val tag = MemoryTag(Ntag.chips[2])
            override fun support() = NfcSupport.READY
            override suspend fun <T> withTag(block: suspend (TagIo) -> T): T = block(tag)
        }
        assertEquals(NfcSupport.READY, reader.support())
        val result = reader.withTag { Ntag.encode(it, Ntag.inspect(it), url, pwd, pack) }
        assertTrue(result.protectedNow)
    }
}
