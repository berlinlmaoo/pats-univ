package id.znetworks.patsuniv

import org.junit.Test
import org.junit.Assert.*
import kotlinx.serialization.json.*
import java.time.Instant

class MemberLogicTest {
    private val draw = body("prize" to "Prize", "capacity" to 5, "entries" to JsonArray(emptyList()), "peakStartsAt" to "2026-10-18T12:00:00Z", "peakEndsAt" to "2026-10-18T13:00:00Z")
    @Test fun entryGuardsMatchServerWindowAndExistingEntry() {
        assertFalse(canEnterDraw(draw, Instant.parse("2026-10-18T11:59:59Z")))
        assertTrue(canEnterDraw(draw, Instant.parse("2026-10-18T12:00:00Z")))
        assertFalse(canEnterDraw(draw, Instant.parse("2026-10-18T13:00:00Z")))
        assertFalse(canEnterDraw(JsonObject(draw + ("ownEntryId" to JsonPrimitive("entry"))), Instant.parse("2026-10-18T12:00:00Z")))
        assertFalse(canEnterDraw(JsonObject(draw + ("startedAt" to JsonPrimitive("2026-10-18T12:05:00Z"))), Instant.parse("2026-10-18T12:30:00Z")))
        assertFalse(canEnterDraw(JsonObject(draw + ("entries" to JsonArray((1..5).map { body("id" to it) }))), Instant.parse("2026-10-18T12:30:00Z")))
    }
    @Test fun numericInputsRejectBlankNegativeFractionAndOverflow() {
        assertTrue(validCount("0")); assertTrue(validCount("1000000")); assertFalse(validCount("")); assertFalse(validCount("-1")); assertFalse(validCount("1.5")); assertFalse(validCount("1000001")); assertFalse(validCount("999999999999999"))
    }
    @Test fun displayUsesIndonesianSeparatorsAndCityTimeZone() {
        assertEquals("3.800", count(3800)); assertEquals("Rp 6.000.000", money(6000000))
        assertTrue(dateTime("2026-10-18T12:30:00Z", "en", "Asia/Jakarta").endsWith("19.30 WIB"))
        assertTrue(dateTime("2026-10-18T12:30:00Z", "id", "Asia/Jayapura").endsWith("21.30 WIT"))
    }
}
