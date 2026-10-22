package id.znetworks.patsuniv

import org.junit.Assert.*
import org.junit.Test

class PosterProofReviewTest {
    @Test fun queueFiltersUseContractStatusesAndEscapeEventIds() {
        assertEquals("/api/admin/poster-proofs?status=PENDING", posterProofQueuePath("PENDING"))
        assertEquals("/api/admin/poster-proofs?status=APPROVED", posterProofQueuePath("APPROVED", " "))
        assertEquals("/api/admin/poster-proofs?status=REJECTED&eventId=event%26status%3DPENDING", posterProofQueuePath("REJECTED", "event&status=PENDING"))
    }

    @Test fun rejectionRequiresThreeTrimmedCharactersAndHonorsServerMaximum() {
        assertEquals("bad", posterProofDecisionPayload("REJECTED", "  bad  ").text("reason"))
        assertEquals(500, posterProofDecisionPayload("REJECTED", "x".repeat(500)).text("reason").length)
        listOf("", "   ", " ab ", "x".repeat(501)).forEach { reason ->
            assertTrue(runCatching { posterProofDecisionPayload("REJECTED", reason) }.isFailure)
        }
    }

    @Test fun approvalDoesNotSendStaleRejectionTextOrClientXp() {
        val payload = posterProofDecisionPayload("APPROVED", "x".repeat(501))
        assertEquals("APPROVED", payload.text("decision"))
        assertEquals("", payload.text("reason"))
        assertFalse(payload.containsKey("xp"))
        assertFalse(payload.containsKey("rewardXp"))
    }

    @Test fun unknownStatusesAndDecisionsCannotBeSent() {
        assertTrue(runCatching { posterProofQueuePath("ALL") }.isFailure)
        assertTrue(runCatching { posterProofDecisionPayload("PENDING", "reason") }.isFailure)
    }
}
