package id.znetworks.patsuniv

import org.junit.Assert.assertEquals
import org.junit.Test

class CardValidityTest {
    @Test fun transportDelayConsumesTheTokenLifetime() {
        val code = body("serverTime" to "2026-10-21T12:00:00Z", "expiresAt" to "2026-10-21T12:00:30Z")
        val deadline = cardTokenDeadline(code, requestStartedElapsed = 1_000)
        assertEquals(31_000L, deadline)
        assertEquals(0L, (deadline - 35_000).coerceAtLeast(0))
    }

    @Test fun invalidOrExpiredValidityCannotProduceALiveCode() {
        assertEquals(1_000L, cardTokenDeadline(body(), 1_000))
        assertEquals(1_000L, cardTokenDeadline(body("serverTime" to "2026-10-21T12:01:00Z", "expiresAt" to "2026-10-21T12:00:30Z"), 1_000))
    }
}
