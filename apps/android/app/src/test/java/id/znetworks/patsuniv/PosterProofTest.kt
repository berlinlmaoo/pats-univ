package id.znetworks.patsuniv

import org.junit.Assert.*
import org.junit.Test

class PosterProofTest {
    @Test fun optionalPosterNeverReplacesRequiredCurrentStep() {
        val poster = body("key" to "poster", "state" to "optional", "completion" to "review", "optional" to true)
        val reservation = body("key" to "reservation", "state" to "current", "completion" to "tap")
        val steps = listOf(poster, reservation)
        assertEquals(reservation, visibleJourneyStep(steps))
        assertEquals(poster, visibleJourneyStep(steps, "poster"))
        assertTrue(maySkipPosterStep(poster))
        assertFalse(mayTapJourneyStep(poster))
        assertTrue(mayTapJourneyStep(reservation))
        assertFalse(maySkipPosterStep(body("key" to "poster", "state" to "done", "optional" to true)))
    }

    @Test fun approvedProofCannotBeReplacedButPendingAndRejectedCan() {
        assertTrue(canReplacePosterProof(body()))
        assertTrue(canReplacePosterProof(body("status" to "PENDING")))
        assertTrue(canReplacePosterProof(body("status" to "REJECTED")))
        assertFalse(canReplacePosterProof(body("status" to "APPROVED")))
    }

    @Test fun proofUploadUsesExactTypeAndSizeLimits() {
        listOf("image/jpeg", "image/png", "image/webp").forEach {
            assertTrue(validPosterProofImage(1, it))
            assertTrue(validPosterProofImage(POSTER_PROOF_MAX_BYTES, it))
            assertFalse(validPosterProofImage(0, it))
            assertFalse(validPosterProofImage(POSTER_PROOF_MAX_BYTES + 1, it))
        }
        assertFalse(validPosterProofImage(100, "image/gif"))
        assertFalse(validPosterProofImage(100, "image/svg+xml"))
    }

    @Test fun privateScreenshotsNeverAcceptAnotherHostOrUnrelatedRoute() {
        assertTrue(isPosterProofImagePath("/api/poster-proofs/abc-123/image"))
        assertTrue(isPosterProofImagePath("/api/poster-proofs/abc-123/image?v=1792669123000"))
        listOf("https://example.com/api/poster-proofs/abc/image", "//example.com/api/poster-proofs/abc/image", "/api/poster-proofs/../image", "/api/poster-proofs/abc/image?redirect=https://example.com", "/api/admin/events/abc", "/api/poster-proofs/abc/image#fragment").forEach {
            assertFalse(it, isPosterProofImagePath(it))
        }
    }
}
