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
/** Server lifecycle decisions are authoritative; local boundaries also expire an already-open screen. */
fun canScanAdminWorkspace(workspace: JsonObject, now: Instant = Instant.now()): Boolean =
    workspace.obj("lifecycle").flag("canScan") && canScanAdminEvent(workspace.obj("event"), now)
fun adminWorkspaceActions(workspace: JsonObject, now: Instant = Instant.now()): List<String> {
    val lifecycle = workspace.obj("lifecycle")
    val beforeClose = runCatching { now < Instant.parse(lifecycle.text("checkInClosesAt")) }.getOrDefault(false)
    return buildList {
        if (lifecycle.flag("canPublish")) add("publish")
        if (beforeClose && lifecycle.flag("canOpen")) add("open")
        if (beforeClose && lifecycle.flag("canClose")) add("close")
    }
}
fun canRunAdminDraw(event: JsonObject, draw: JsonObject, now: Instant = Instant.now()): Boolean = runCatching {
    event.text("status") == "OPEN" && now >= Instant.parse(event.text("startsAt")) && now < Instant.parse(event.text("endsAt")) &&
        draw.text("startedAt").isBlank() && draw.text("prize").isNotBlank() && draw.number("capacity") > 0 && draw.rows("entries").size == draw.number("capacity")
}.getOrDefault(false)
fun canRunStaffDraw(response: JsonObject, now: Instant = Instant.now()): Boolean =
    response.flag("canRun") && canRunAdminDraw(response.obj("event"), response.obj("draw"), now)
fun activeRewardCode(redemption: JsonObject, now: Instant = Instant.now()): Boolean = runCatching {
    redemption.text("status") == "ISSUED" && now < Instant.parse(redemption.text("expiresAt"))
}.getOrDefault(false)
fun usableRepairGrant(request: JsonObject, now: Instant = Instant.now()): Boolean = runCatching {
    request.text("status") == "APPROVED" && request.flag("mine") && now < Instant.parse(request.text("grantExpiresAt"))
}.getOrDefault(false)
/** Rejection does not need adjusted counts. The shared schema accepts reason, not rejectReason. */
fun claimFieldEditable(claim: JsonObject, field: String): Boolean =
    (claim["editableFields"] as? JsonArray)?.any { (it as? JsonPrimitive)?.contentOrNull == field } == true &&
        (field != "guestCount" || claim.flag("glAllowed"))
fun claimReviewPayload(id: String, decision: String, guests: String, reservations: String, reason: String, allowGuests: Boolean = true, allowReservations: Boolean = true): JsonObject =
    JsonObject(body("id" to id, "decision" to decision, "reason" to reason.trim()) + if (decision == "APPROVED") buildMap {
        if (allowGuests) put("guestCount", JsonPrimitive(guests.toInt()))
        if (allowReservations) put("reservationCount", JsonPrimitive(reservations.toInt()))
    } else emptyMap())
