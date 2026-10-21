package id.znetworks.patsuniv

import java.time.Instant
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class AdminEligibilityTest {
    private val now = Instant.parse("2026-10-21T14:00:00Z")
    private val event = body("status" to "OPEN", "phase" to "open", "startsAt" to "2026-10-21T13:00:00Z", "endsAt" to "2026-10-21T18:00:00Z", "checkInOpensAt" to "2026-10-21T12:00:00Z", "checkInClosesAt" to "2026-10-21T17:00:00Z")
    private fun JsonObject.with(key: String, value: String) = JsonObject(this + (key to JsonPrimitive(value)))

    @Test fun scanRequiresActualOpenWindowAndRefusesTheExactCloseBoundary() {
        assertTrue(canScanAdminEvent(event, now))
        assertTrue(canScanAdminEvent(event, Instant.parse(event.text("checkInOpensAt"))))
        assertFalse(canScanAdminEvent(event, Instant.parse(event.text("checkInClosesAt"))))
        assertFalse(canScanAdminEvent(event, Instant.parse("2026-10-21T11:59:59Z")))
        assertFalse(canScanAdminEvent(event.with("phase", "ended"), now))
        assertFalse(canScanAdminEvent(event.with("status", "CLOSED"), now))
        assertFalse(canScanAdminEvent(event.with("checkInClosesAt", ""), now))
    }
    @Test fun endedOrDraftEventsCannotOfferInvalidLifecycleActions() {
        assertEquals(listOf("close"), adminEventActions(event, now))
        assertTrue(adminEventActions(event, Instant.parse("2026-10-21T17:00:00Z")).isEmpty())
        assertEquals(listOf("publish"), adminEventActions(event.with("status", "DRAFT"), now))
        assertTrue(adminEventActions(event.with("status", "CLOSED").with("phase", "ended"), now).isEmpty())
    }
    @Test fun drawRequiresLiveEventConfiguredPrizeAndExactlyFullSlots() {
        val draw = body("prize" to "Gift", "capacity" to 1, "entries" to JsonArray(listOf(body("id" to "entry"))))
        assertTrue(canRunAdminDraw(event, draw, now))
        assertFalse(canRunAdminDraw(event.with("status", "CLOSED"), draw, now))
        assertFalse(canRunAdminDraw(event, draw, Instant.parse(event.text("endsAt"))))
        assertFalse(canRunAdminDraw(event, draw.with("startedAt", now.toString()), now))
        assertFalse(canRunAdminDraw(event, draw.with("prize", ""), now))
        assertFalse(canRunAdminDraw(event, body("prize" to "Gift", "capacity" to 2, "entries" to draw["entries"]), now))
    }
    @Test fun expiredOrUsedCodesAndAnotherCrewsRepairGrantAreNotActionable() {
        val expires = "2026-10-21T15:00:00Z"
        val code = body("status" to "ISSUED", "expiresAt" to expires)
        assertTrue(activeRewardCode(code, now))
        assertFalse(activeRewardCode(code, Instant.parse(expires)))
        assertFalse(activeRewardCode(code.with("status", "FULFILLED"), now))
        val request = body("status" to "APPROVED", "mine" to true, "grantExpiresAt" to expires)
        assertTrue(usableRepairGrant(request, now))
        assertFalse(usableRepairGrant(request, Instant.parse(expires)))
        assertFalse(usableRepairGrant(JsonObject(request + ("mine" to JsonPrimitive(false))), now))
    }
    @Test fun rejectionUsesServerReasonContractAndDoesNotParseInvalidAdjustmentFields() {
        val rejected = claimReviewPayload("claim", "REJECTED", "", "not a number", "  receipt does not match  ")
        assertEquals("receipt does not match", rejected.text("reason"))
        assertFalse(rejected.containsKey("rejectReason"))
        assertFalse(rejected.containsKey("guestCount"))
        assertFalse(rejected.containsKey("reservationCount"))
        assertEquals(3, claimReviewPayload("claim", "APPROVED", "2", "3", "").number("reservationCount"))
    }
    @Test fun workspaceServerDenialOverridesLocallyOpenEventAndEarlyOpenUsesLifecycle() {
        val lifecycle = body("canScan" to false, "canPublish" to false, "canOpen" to true, "canClose" to false, "checkInClosesAt" to event.text("checkInClosesAt"))
        val workspace = body("event" to event, "lifecycle" to lifecycle)
        assertFalse(canScanAdminWorkspace(workspace, now))
        assertEquals(listOf("open"), adminWorkspaceActions(workspace, now))
        assertTrue(adminWorkspaceActions(workspace, Instant.parse(event.text("checkInClosesAt"))).isEmpty())
        assertTrue(canScanAdminWorkspace(body("event" to event, "lifecycle" to body("canScan" to true)), now))
        assertFalse(canScanAdminWorkspace(body("event" to event, "lifecycle" to body("canScan" to true)), Instant.parse(event.text("checkInClosesAt"))))
    }
    @Test fun staffDrawRequiresServerPermissionEvenWhenLocallyEligible() {
        val draw = body("prize" to "Gift", "capacity" to 1, "entries" to JsonArray(listOf(body("id" to "entry"))))
        assertFalse(canRunStaffDraw(body("event" to event, "draw" to draw, "canRun" to false), now))
        assertTrue(canRunStaffDraw(body("event" to event, "draw" to draw, "canRun" to true), now))
        assertFalse(canRunStaffDraw(body("event" to event, "draw" to draw, "canRun" to true), Instant.parse(event.text("endsAt"))))
    }
    @Test fun disallowedClaimFieldsAreHiddenAndOmittedEvenWithStaleGuestValues() {
        val noGl = body("glAllowed" to false, "editableFields" to JsonArray(listOf(JsonPrimitive("reservationCount"))))
        assertFalse(claimFieldEditable(noGl, "guestCount"))
        assertTrue(claimFieldEditable(noGl, "reservationCount"))
        assertFalse(claimFieldEditable(body("glAllowed" to true), "guestCount"))
        assertFalse(claimFieldEditable(body("glAllowed" to false, "editableFields" to JsonArray(listOf(JsonPrimitive("guestCount")))), "guestCount"))
        val payload = claimReviewPayload("claim", "APPROVED", "invalid stale value", "4", "", allowGuests = false)
        assertFalse(payload.containsKey("guestCount"))
        assertEquals(4, payload.number("reservationCount"))
        assertFalse(claimReviewPayload("claim", "APPROVED", "", "", "", false, false).containsKey("reservationCount"))
    }
}
