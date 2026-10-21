package id.znetworks.patsuniv

import org.junit.Assert.*
import org.junit.Test

class UxNavigationTest {
    @Test fun contextualRoutesKeepTheirDestination() {
        assertEquals("profile", routeTab("history"))
        assertEquals("profile", routeTab("claims/history"))
        assertEquals("profile", routeTab("my-access"))
        assertEquals("events", routeTab("conversation/booking-id"))
        assertEquals("events", routeTab("city-event/event-id"))
        assertEquals("events", routeTab("draw/event-id"))
        assertEquals("hub", routeTab("channel/city-channel"))
        assertEquals("hub", routeTab("community-tools"))
        assertEquals("home", routeTab("wallet/activity"))
    }
    @Test fun staffPresentationRequiresExistingCapability() {
        assertEquals("card.encode", operationalCapability("encode-run/batch-id"))
        assertEquals("checkin.scan", operationalCapability("scan/event-id"))
        assertEquals("hq.manage", operationalCapability("hub-access/city-id"))
        assertEquals("hq.manage", operationalCapability("hq-web"))
        assertEquals("hq.manage", operationalCapability("content-approvals/submission-id"))
        assertEquals("city.operations", operationalCapability("event-content/event-id"))
        assertNull(operationalCapability("card"))
        assertNull(operationalCapability("event/member-event"))
    }
    @Test fun staffRoleDoesNotManufacturePersonalMembership() {
        val token = Tokens("fixture", "2099-01-01T00:00:00Z", "fixture")
        assertFalse(hasPersonalMembership(Session(token, body("user" to body("role" to "SUPER_ADMIN")))))
        assertFalse(hasPersonalMembership(Session(token, body("user" to body("role" to "MEMBER")))))
        assertTrue(hasPersonalMembership(Session(token, body("user" to body("role" to "MEMBER"), "member" to body("id" to "member-id")))))
        assertTrue(hasPersonalMembership(Session(token, body("user" to body("role" to "SUPER_ADMIN", "membership" to "member"), "member" to body("id" to "member-id")))))
        assertFalse(hasPersonalMembership(Session(token, body("user" to body("role" to "SUPER_ADMIN", "membership" to "staffOnly"), "member" to body("id" to "stale-member")))))
        assertTrue(isStaff(Session(token, body("user" to body("adminScope" to body("kind" to "HQ"))))))
    }
}
