package id.znetworks.patsuniv

import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class EventReportTest {
    private val complete = eventReportFields.associateWith { "0" }

    @Test fun sevenNumbersAreRequiredAndDoNotDefaultMissingValuesToZero() {
        assertTrue(eventReportErrors(complete).isEmpty())
        assertEquals(eventReportFields.toSet(), eventReportErrors(emptyMap()).keys)
        assertEquals(setOf("paxTotal"), eventReportErrors(complete - "paxTotal").keys)
        assertEquals(setOf("fdcSold"), eventReportErrors(complete + ("fdcSold" to "")).keys)
    }

    @Test fun integerBoundsRejectFractionsSignsOverflowAndPastedText() {
        listOf("0", "1000000", "00012").forEach { assertTrue(it, validReportNumber(it)) }
        listOf("", "-1", "+1", "1.5", "1,000", " 1 ", "1e3", "1000001", "2147483648", "١").forEach { assertFalse(it, validReportNumber(it)) }
    }

    @Test fun saveSendsExactlySevenIntegersIncludingExplicitZero() {
        val payload = eventReportPayload(complete + ("fdcSold" to "00012") + ("reference" to "999"))
        assertEquals(eventReportFields.toSet(), payload.keys)
        assertEquals(12, payload.number("fdcSold"))
        assertEquals(0, payload.number("nonMembersAttended"))
        assertFalse(payload.getValue("fdcSold").jsonPrimitive.isString)
        assertTrue(runCatching { eventReportPayload(complete - "tablesSold") }.isFailure)
    }

    @Test fun systemReferencesStaySeparateAndPaxUsesReservationPax() {
        val reference = body("tablesSold" to 6, "reservationPax" to 20, "membersAttended" to 18)
        assertEquals("6", eventReportReference(reference, "tablesSold"))
        assertEquals("20", eventReportReference(reference, "paxTotal"))
        assertNull(eventReportReference(reference, "fdcSold"))
        assertNull(eventReportReference(reference, "nonMembersAttended"))
        assertTrue(EventReportDraft(body()).values.values.all { it.isEmpty() })
    }

    @Test fun incomingReportRefreshPreservesRawUnsavedDraftAndResetsAfterSave() {
        val draft = EventReportDraft(eventReportPayload(complete))
        draft.edit("fdcSold", "00042")
        draft.edit("paxTotal", "invalid paste")
        draft.receive(eventReportPayload(complete + ("fdcSold" to "99")))
        assertEquals("00042", draft.values["fdcSold"])
        assertEquals("invalid paste", draft.values["paxTotal"])
        assertTrue(draft.dirty)
        draft.saved(eventReportPayload(complete + ("fdcSold" to "42")))
        assertFalse(draft.dirty)
        assertEquals("42", draft.values["fdcSold"])
        draft.receive(eventReportPayload(complete + ("tablesSold" to "2")))
        assertEquals("2", draft.values["tablesSold"])
    }

    @Test fun unreportedFdcIsDistinctFromReportedZero() {
        assertNull(reportedFdcValue(body("status" to "notReported", "value" to null)))
        assertNull(reportedFdcValue(body("status" to "reported")))
        assertEquals(0, reportedFdcValue(body("status" to "reported", "value" to 0)))
        assertEquals(12, reportedFdcValue(body("status" to "reported", "value" to 12)))
    }

    @Test fun periodFiltersAllowOpenBoundsAndInclusiveSingleDates() {
        assertTrue(validReportPeriod("", ""))
        assertTrue(validReportPeriod("2026-10-22", "2026-10-22"))
        assertTrue(validReportPeriod("", "2026-10-22"))
        assertFalse(validReportPeriod("2026-02-30", ""))
        assertFalse(validReportPeriod("2026-10-23", "2026-10-22"))
        assertFalse(validReportPeriod("2026-1-1", ""))
        assertEquals("/api/admin/event-reports?cityId=city+one&from=2026-10-01&to=2026-10-22", eventReportsPath("city one", "2026-10-01", "2026-10-22"))
    }

    @Test fun reportsDueUsesEndTimeAndExcludesFutureReportedAndOlderEvents() {
        val now = Instant.parse("2026-10-22T12:00:00Z")
        fun row(end: String, report: JsonElement = JsonNull) = body("event" to body("endsAt" to end), "report" to report)
        assertTrue(eventReportIsDue(row("2026-10-22T12:00:00Z"), now))
        assertTrue(eventReportIsDue(row("2026-09-22T12:00:00Z"), now))
        assertFalse(eventReportIsDue(row("2026-09-22T11:59:59Z"), now))
        assertFalse(eventReportIsDue(row("2026-10-22T12:00:01Z"), now))
        assertFalse(eventReportIsDue(row("2026-10-21T12:00:00Z", eventReportPayload(complete)), now))
        assertFalse(eventReportIsDue(row(""), now))
    }

    @Test fun customDueDatesUseTheEventCityTimezoneAtMidnight() {
        val row = body("event" to body("endsAt" to "2026-10-01T16:30:00Z"), "report" to JsonNull)
        val now = Instant.parse("2026-10-22T12:00:00Z")
        assertTrue(eventReportIsDueInPeriod(row, "2026-10-01", "2026-10-01", "Asia/Jakarta", now))
        assertFalse(eventReportIsDueInPeriod(row, "2026-10-01", "2026-10-01", "Asia/Jayapura", now))
        assertTrue(eventReportIsDueInPeriod(row, "2026-10-02", "2026-10-02", "Asia/Jayapura", now))
        assertFalse(eventReportIsDueInPeriod(row, "", "", "Asia/Jakarta", Instant.parse("2026-10-01T15:00:00Z")))
    }
}
