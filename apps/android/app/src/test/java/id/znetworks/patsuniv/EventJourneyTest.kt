package id.znetworks.patsuniv

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.*
import org.junit.Test

class EventJourneyTest {
    private fun session(role: String, member: Boolean = true, capabilities: List<String> = emptyList()) = Session(
        Tokens("", "", ""),
        body("user" to body("id" to "user", "role" to role, "capabilities" to JsonArray(capabilities.map { JsonPrimitive(it) })),
            "member" to if (member) body("id" to "member", "city" to body("id" to "jakarta")) else body())
    )

    @Test fun staffPresentationDoesNotCreateMemberApiAccess() {
        assertTrue(canParticipateInEvent(session("MEMBER")))
        assertFalse(canParticipateInEvent(session("MEMBER", member = false)))
        assertFalse(canParticipateInEvent(session("REGIONAL_ADMIN", capabilities = listOf("city.operations"))))
        assertFalse(canParticipateInEvent(null))
        assertEquals("/api/admin/events", eventBrowsePath(session("HQ_ADMIN", member = false, capabilities = listOf("city.operations")), false, true))
        assertEquals("/api/events?scope=all", eventBrowsePath(session("MEMBER"), false, true))
        assertEquals("/api/events", eventBrowsePath(session("MEMBER"), false, false))
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
        assertTrue(canCompleteEventJourney(body("phase" to "open", "myCheckIn" to body("checkedInAt" to "2026-10-21T12:00:00Z"))))
        assertTrue(canCompleteEventJourney(body("phase" to "ended")))
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
