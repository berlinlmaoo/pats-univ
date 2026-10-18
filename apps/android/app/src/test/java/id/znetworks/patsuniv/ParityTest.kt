package id.znetworks.patsuniv

import org.junit.Assert.*
import org.junit.Test

class ParityTest {
    @Test fun everyDrawWinnerStopsAtTheTopPointer() {
        repeat(5) { winner ->
            val centre = (winner + .5f) * 72f
            assertEquals(270f, (wheelTarget(winner, 5) + centre) % 360f, .001f)
        }
    }
    @Test fun notificationPayloadsPreservePrivateRoomAndCardDestinations() {
        assertEquals("conversation/private", notificationRoute(body("screen" to "hub", "conversationId" to "private", "channelId" to "public")))
        assertEquals("channel/city", notificationRoute(body("screen" to "hub", "channelId" to "city")))
        assertEquals("member-card/member", notificationRoute(body("screen" to "memberCard", "memberId" to "member")))
        assertEquals("social-operations", notificationRoute(body("screen" to "reservations")))
        assertNull(notificationRoute(body("screen" to "event")))
        assertNull(notificationRoute(body("screen" to "unknown")))
    }
    @Test fun serverErrorParametersRetainLeaseHolderAndRetryDelay() {
        assertEquals(mapOf("station" to "Phone 2", "seconds" to "27"), errorArgs(ApiFailure("CARD_CLAIMED", body("params" to body("station" to "Phone 2", "seconds" to 27)))).toMap())
        assertEquals(mapOf("seconds" to "60"), errorArgs(ApiFailure("RATE_LIMITED", body("error" to body("retryAfter" to 60)))).toMap())
        assertEquals("loyalty.checkInRequired", errorKey("CHECK_IN_REQUIRED"))
        assertEquals("loyalty.unavailable", errorKey("REWARD_UNAVAILABLE"))
    }
}
