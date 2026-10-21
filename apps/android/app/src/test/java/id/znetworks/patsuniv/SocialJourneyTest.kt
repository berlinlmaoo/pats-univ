package id.znetworks.patsuniv

import org.junit.Assert.*
import org.junit.Test

class SocialJourneyTest {
    @Test fun unavailableVisitEventNeverFallsBackToAnotherEvent() {
        val events = listOf(body("id" to "bali"), body("id" to "surabaya"))
        assertNull(selectedVisitEvent(events, "jakarta"))
        assertNull(selectedVisitEvent(events, ""))
        assertEquals("surabaya", selectedVisitEvent(events, "surabaya")?.text("id"))
        assertEquals("surabaya", selectedVisitEvent(events.reversed(), "surabaya")?.text("id"))
    }

    @Test fun personalReservationViewDoesNotExposeStaffQueueRows() {
        val session = Session(Tokens("", "", ""), body("member" to body("id" to "my-member")))
        val rows = listOf(body("id" to "mine", "memberId" to "my-member"), body("id" to "other", "memberId" to "other-member"), body("id" to "unknown"))
        assertEquals(listOf("mine"), ownSocialRows(rows, session).map { it.text("id") })
    }

    @Test fun staffWithoutMembershipHasNoPersonalBookings() {
        val session = Session(Tokens("", "", ""), body("user" to body("role" to "SUPER_ADMIN")))
        assertTrue(ownSocialRows(listOf(body("id" to "staff-queue", "memberId" to "member")), session).isEmpty())
    }

    @Test fun reservationReviewUsesSlotOverrideThenVenueFallbackWithoutInventingZero() {
        assertEquals(500000, reservationMinimumCharge(body("minimumCharge" to 1000000), body("minimumCharge" to 500000)))
        assertEquals(1000000, reservationMinimumCharge(body("minimumCharge" to 1000000), body("minimumCharge" to null)))
        assertEquals(0, reservationMinimumCharge(body("minimumCharge" to 1000000), body("minimumCharge" to 0)))
        assertNull(reservationMinimumCharge(body(), body()))
    }

    @Test fun depositReceiptMatchesServerIntegerLimits() {
        assertTrue(validReservationDeposit("1"))
        assertTrue(validReservationDeposit("2000000000"))
        listOf("", "0", "-1", "1.5", "2000000001", "9999999999999999").forEach { assertFalse(validReservationDeposit(it)) }
    }
}
