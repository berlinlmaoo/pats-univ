package id.znetworks.patsuniv

import org.junit.Test
import org.junit.Assert.*

class AdminValidationTest {
    private val event = mapOf("title" to "Night event", "date" to "2026-10-18", "startTime" to "20:00", "endTime" to "02:00", "opensBeforeMinutes" to "60", "capacity" to "")
    @Test fun eventValidationAllowsOvernightAndRejectsInvalidCalendarAndLimits() {
        assertTrue(validEventFields(event))
        assertFalse(validEventFields(event + ("date" to "2026-02-30")))
        assertFalse(validEventFields(event + ("startTime" to "25:00")))
        assertFalse(validEventFields(event + ("opensBeforeMinutes" to "721")))
        assertFalse(validEventFields(event + ("capacity" to "0")))
        assertFalse(validEventFields(event + ("title" to " ")))
        assertFalse(validEventFields(event + ("title" to "X")))
        assertFalse(validEventFields(event + ("title" to "X".repeat(121))))
        assertFalse(validEventFields(event + ("description" to "X".repeat(2001))))
    }
    @Test fun printedLookupAcceptsNimTokenAndUrlWithoutAcceptingTruncatedTokens() {
        assertTrue(validCardLookup(" jkt 2600001 "))
        assertTrue(validCardLookup("AbCdEfGhIjKlMnOpQrStUvWxYz012345"))
        assertTrue(validCardLookup("https://patsuniv.znetworks.id/c/AbCdEfGhIjKlMnOpQrStUvWxYz012345"))
        assertFalse(validCardLookup("JKT26001")); assertFalse(validCardLookup("https://patsuniv.znetworks.id/c/short"))
    }
}
