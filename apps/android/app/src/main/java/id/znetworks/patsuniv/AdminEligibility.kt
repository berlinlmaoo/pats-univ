package id.znetworks.patsuniv

import kotlinx.serialization.json.*
import java.time.Instant

/** Presentation guards mirror existing server boundaries; server authorization remains authoritative. */
fun canScanAdminEvent(event: JsonObject, now: Instant = Instant.now()): Boolean = runCatching {
    event.text("status") == "OPEN" && event.text("phase") == "open" &&
        now >= Instant.parse(event.text("checkInOpensAt")) && now < Instant.parse(event.text("checkInClosesAt"))
}.getOrDefault(false)
fun adminEventActions(event: JsonObject, now: Instant = Instant.now()): List<String> = runCatching {
    val beforeClose = now < Instant.parse(event.text("checkInClosesAt"))
    buildList {
        if (event.text("status") == "DRAFT" && beforeClose) add("publish")
        if (event.text("status") !in setOf("OPEN", "DRAFT") && beforeClose && event.text("phase") != "ended") add("open")
        if (canScanAdminEvent(event, now)) add("close")
    }
}.getOrDefault(emptyList())
fun canRunAdminDraw(event: JsonObject, draw: JsonObject, now: Instant = Instant.now()): Boolean = runCatching {
    event.text("status") == "OPEN" && now >= Instant.parse(event.text("startsAt")) && now < Instant.parse(event.text("endsAt")) &&
        draw.text("startedAt").isBlank() && draw.text("prize").isNotBlank() && draw.number("capacity") > 0 && draw.rows("entries").size == draw.number("capacity")
}.getOrDefault(false)
fun activeRewardCode(redemption: JsonObject, now: Instant = Instant.now()): Boolean = runCatching {
    redemption.text("status") == "ISSUED" && now < Instant.parse(redemption.text("expiresAt"))
}.getOrDefault(false)
fun usableRepairGrant(request: JsonObject, now: Instant = Instant.now()): Boolean = runCatching {
    request.text("status") == "APPROVED" && request.flag("mine") && now < Instant.parse(request.text("grantExpiresAt"))
}.getOrDefault(false)
/** Rejection does not need adjusted counts. The shared schema accepts reason, not rejectReason. */
fun claimReviewPayload(id: String, decision: String, guests: String, reservations: String, reason: String): JsonObject =
    JsonObject(body("id" to id, "decision" to decision, "reason" to reason.trim()) +
        if (decision == "APPROVED") mapOf("guestCount" to JsonPrimitive(guests.toInt()), "reservationCount" to JsonPrimitive(reservations.toInt())) else emptyMap())
