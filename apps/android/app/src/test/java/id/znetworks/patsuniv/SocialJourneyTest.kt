package id.znetworks.patsuniv

import org.junit.Assert.*
import org.junit.Test
import kotlinx.serialization.json.*

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
        assertEquals(500000, reservationMinimumCharge(body("venueMinimumCharge" to 1000000), body("minimumCharge" to 500000)))
        assertEquals(1000000, reservationMinimumCharge(body("venueMinimumCharge" to 1000000), body("minimumCharge" to null)))
        assertEquals(0, reservationMinimumCharge(body("venueMinimumCharge" to 1000000), body("minimumCharge" to 0)))
        assertNull(reservationMinimumCharge(body(), body()))
    }

    @Test fun depositReceiptMatchesServerIntegerLimits() {
        assertTrue(validReservationDeposit("1"))
        assertTrue(validReservationDeposit("2000000000"))
        listOf("", "0", "-1", "1.5", "2000000001", "9999999999999999").forEach { assertFalse(validReservationDeposit(it)) }
    }

    @Test fun depositActionsRespectAuthoritativePaymentAndServerPermissionForPendingAndConfirmed() {
        val crew = Session(Tokens("", "", ""), body("user" to body("capabilities" to JsonArray(listOf(JsonPrimitive("reservation.manage"))))))
        val pending = body("status" to "PENDING", "canRecordDeposit" to true, "payment" to body("paid" to false))
        assertTrue(canRecordReservationDeposit(crew, pending, true))
        assertTrue(canRecordReservationDeposit(crew, JsonObject(pending + body("status" to "CONFIRMED")), true))
        assertFalse(canRecordReservationDeposit(crew, pending, false))
        assertFalse(canRecordReservationDeposit(crew, JsonObject(pending + body("canRecordDeposit" to false)), true))
        assertFalse(canRecordReservationDeposit(crew, JsonObject(pending + body("payment" to body("paid" to true), "downPaymentAt" to null)), true))
        listOf("REJECTED", "CANCELLED").forEach { assertFalse(canRecordReservationDeposit(crew, JsonObject(pending + body("status" to it)), true)) }
    }

    @Test fun serverBookingErrorOpensItsExactConversationOrReservation() {
        assertEquals("conversation/private", blockingReservationRoute(mapOf("reservationId" to "unpaid", "conversationId" to "private", "eventId" to "earlier-event")))
        assertEquals("booking/unpaid", blockingReservationRoute(mapOf("reservationId" to "unpaid", "conversationId" to "")))
        assertEquals("booking/earlier-event/unpaid", blockingReservationRoute(mapOf("reservationId" to "unpaid", "eventId" to "earlier-event")))
        assertNull(blockingReservationRoute(mapOf("eventId" to "event-without-booking")))
    }

    @Test fun reservationCardsUseApprovedNestedPosterAndBothConversationShapes() {
        val card = body("event" to body("id" to "event", "description" to "raw text", "poster" to body("url" to "/approved", "description" to "approved text")), "conversationId" to "chat")
        assertEquals("approved text", reservationPosterEvent(card).text("description"))
        assertEquals("/approved", reservationPosterEvent(card).text("flyerUrl"))
        assertEquals("chat", reservationConversationId(card))
        assertEquals("chat", reservationConversationId(body("conversation" to body("id" to "chat"))))
        assertEquals("", reservationPosterEvent(body("event" to body("description" to "pending text"))).text("description"))
        assertEquals("event", reservationEventId(card))
    }

    @Test fun roamingAvailabilityAndPayloadStayBoundToTheExplicitEvent() {
        val options = body("event" to body("id" to "chosen"))
        assertTrue(roamingOptionAvailable(options, body("available" to true), "chosen"))
        assertFalse(roamingOptionAvailable(options, body("available" to false, "reason" to "requestExists"), "chosen"))
        assertFalse(roamingOptionAvailable(options, body("available" to true), "other"))
        val payload = roamingRequestPayload("chosen", "ATTENDANCE")
        assertEquals("chosen", payload.text("eventId"))
        assertEquals(payload.text("eventId"), payload.text("originEventId"))
    }

    @Test fun socialQueueRoutesKeepTheEventAndResolveActualAccessType() {
        assertEquals("/api/social/operations?eventId=chosen", reservationOperationsPath("chosen"))
        assertEquals("/api/social/operations", reservationOperationsPath())
        assertEquals("event-roaming/chosen", socialAccessRoute(body("type" to "ATTENDANCE", "eventId" to "chosen")))
        assertEquals("hub-access/city", socialAccessRoute(body("type" to "SOCIAL_HUB", "targetCityId" to "city", "eventId" to "chosen")))
        assertNull(socialAccessRoute(body("type" to "SOCIAL_HUB")))
    }
}
