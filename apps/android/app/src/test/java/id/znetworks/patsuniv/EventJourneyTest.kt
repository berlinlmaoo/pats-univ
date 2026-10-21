package id.znetworks.patsuniv

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.*
import org.junit.Test

class EventJourneyTest {
    @Test fun claimNotificationKeepsTheExactClaim() {
        assertEquals("claims/event-42/claim-7", notificationTargetDestination(body("screen" to "claims", "eventId" to "event-42", "claimId" to "claim-7"), session("MEMBER")))
    }
    private fun session(role: String, member: Boolean = true, capabilities: List<String> = emptyList()) = Session(
        Tokens("", "", ""),
        body("user" to body("id" to "user", "role" to role, "membership" to if (member) "member" else "staffOnly", "adminScope" to if ("city.operations" in capabilities) body("kind" to "CITY") else null, "capabilities" to JsonArray(capabilities.map { JsonPrimitive(it) })),
            "member" to if (member) body("id" to "member", "city" to body("id" to "jakarta")) else body())
    )

    @Test fun membershipControlsPersonalApiAccessForStaffAndMembers() {
        assertTrue(canParticipateInEvent(session("MEMBER")))
        assertFalse(canParticipateInEvent(session("MEMBER", member = false)))
        assertTrue(canParticipateInEvent(session("REGIONAL_ADMIN", capabilities = listOf("city.operations"))))
        assertFalse(canParticipateInEvent(session("REGIONAL_ADMIN", member = false, capabilities = listOf("city.operations"))))
        assertFalse(canParticipateInEvent(null))
        assertEquals("/api/admin/events", eventBrowsePath(session("HQ_ADMIN", member = false, capabilities = listOf("city.operations")), false, true))
        assertEquals("/api/events?scope=national", eventBrowsePath(session("MEMBER"), false, true))
        assertEquals("/api/events?scope=city", eventBrowsePath(session("MEMBER"), false, false))
        assertEquals("/api/events?scope=national", eventBrowsePath(session("REGIONAL_ADMIN", capabilities = listOf("city.operations")), false, true))
    }

    @Test fun anotherCityRequiresKnownDifferentCities() {
        val member = session("MEMBER")
        assertFalse(eventIsOtherCity(member, body("city" to body("id" to "jakarta"))))
        assertTrue(eventIsOtherCity(member, body("city" to body("id" to "bandung"))))
        assertFalse(eventIsOtherCity(member, body()))
        assertFalse(eventIsOtherCity(null, body("city" to body("id" to "bandung"))))
    }

    @Test fun aTapCannotManufactureAttendanceCompletion() {
        assertFalse(canCompleteEventJourney(body("phase" to "open")))
        assertFalse(canCompleteEventJourney(body("phase" to "closed")))
        assertFalse(canCompleteEventJourney(body("phase" to "open", "myCheckIn" to body("checkedInAt" to "2026-10-21T12:00:00Z"))))
        assertFalse(canCompleteEventJourney(body("phase" to "ended")))
        assertTrue(canCompleteEventJourney(body("phase" to "ended", "myCheckIn" to body("checkedInAt" to "2026-10-21T12:00:00Z"))))
    }

    @Test fun currentServerStepCannotBeSkippedBySelectingUpcomingSteps() {
        val event = body("key" to "event", "state" to "done", "completion" to "tap")
        val poster = body("key" to "poster", "state" to "current", "completion" to "tap")
        val checkIn = body("key" to "checkIn", "state" to "upcoming", "completion" to "server")
        assertEquals("poster", visibleJourneyStep(listOf(event, poster, checkIn), "checkIn")?.text("key"))
        assertEquals("event", visibleJourneyStep(listOf(event, poster, checkIn), "event")?.text("key"))
        assertTrue(mayTapJourneyStep(poster))
        assertFalse(mayTapJourneyStep(event))
        assertFalse(mayTapJourneyStep(body("key" to "checkIn", "state" to "current", "completion" to "server")))
        assertFalse(mayTapJourneyStep(body("key" to "completed", "state" to "current", "completion" to "server")))
    }

    @Test fun authoritativeActionsGateQrAndReservationInsteadOfPhaseAlone() {
        val event = body("phase" to "open", "actions" to JsonArray(listOf(body("key" to "showQr", "available" to false, "reason" to "roamingRequired"), body("key" to "reserve", "available" to true))))
        assertFalse(canUseEventAction(event, "showQr"))
        assertEquals("roamingRequired", eventAction(event, "showQr").text("reason"))
        assertTrue(canUseEventAction(event, "reserve"))
        assertFalse(canUseEventAction(body("phase" to "open"), "showQr"))
    }

    @Test fun authoritativeNotificationTargetsKeepIdsAndCapabilities() {
        val staff = session("REGIONAL_ADMIN", member = false, capabilities = listOf("city.operations", "reservation.manage", "promoter.manage"))
        assertEquals("event-reservations/event-42", notificationTargetDestination(body("screen" to "adminReservations", "eventId" to "event-42", "requiresAdminMode" to true), staff))
        assertEquals("access-review/event-42/request-9", notificationTargetDestination(body("screen" to "adminRoaming", "eventId" to "event-42", "requestId" to "request-9", "requiresAdminMode" to true), staff))
        assertNull(notificationTargetDestination(body("screen" to "adminContentQueue", "requiresAdminMode" to true), staff))
        assertNull(notificationTargetDestination(body("screen" to "adminClaims", "requiresAdminMode" to true), session("MEMBER")))
        assertEquals("booking/booking-7", notificationTargetDestination(body("screen" to "reservation", "reservationId" to "booking-7"), session("MEMBER")))
        assertEquals("booking/event-42/booking-7", notificationTargetDestination(body("screen" to "reservation", "eventId" to "event-42", "reservationId" to "booking-7"), session("MEMBER")))
        assertEquals("event/event-42", notificationTargetDestination(body("screen" to "event", "eventId" to "event-42"), session("REGIONAL_ADMIN", capabilities = listOf("city.operations")), false))
        assertEquals("admin-open-notification/n-1/conversation/c-8", notificationOpenRoute("conversation/c-8", true, "n-1"))
        assertEquals("conversation/c-8", notificationOpenRoute("conversation/c-8", false, "n-1"))
    }

    @Test fun notificationsRespectStaffCapabilitiesAndKeepEventContext() {
        val staff = session("REGIONAL_ADMIN", member = false, capabilities = listOf("city.operations", "promoter.manage"))
        val event = body("screen" to "event", "eventId" to "event-42")
        assertEquals("event/event-42", notificationDestination(event, session("MEMBER"), false))
        assertEquals("city-event/event-42", notificationDestination(event, staff, false))
        assertEquals("claims-review", notificationDestination(body("screen" to "claims"), staff, true))
        assertEquals("event-reservations/event-42", notificationDestination(body("screen" to "social-operations", "eventId" to "event-42"), staff, false, "reservationRequested"))
        assertEquals("tools", notificationDestination(body("screen" to "social-operations"), staff, false, "roamingRequested"))
        assertNull(notificationDestination(body("screen" to "memberCard", "memberId" to "another-member"), session("MEMBER"), false))
        assertNull(notificationDestination(body("screen" to "event"), staff, true))
        assertEquals("uxMember.enterAdminNotification", notificationActionKey("city-event/event-42", true))
    }
}
