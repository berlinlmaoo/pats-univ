package id.znetworks.patsuniv

import android.app.Activity
import android.view.WindowManager
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import android.graphics.Bitmap
import com.google.zxing.BarcodeFormat
import com.google.zxing.MultiFormatWriter
import kotlinx.serialization.json.*
import kotlinx.coroutines.*
import java.time.Instant

@Composable fun CheckInStrip(checkIn: JsonObject, language: String, zone: String) {
    Column(Modifier.fillMaxWidth().background(tone("band"), MaterialTheme.shapes.medium).padding(Space.page), verticalArrangement = Arrangement.spacedBy(Space.small)) {
        Badge(tr("app.resultCheckedIn"), "OPEN")
        Text(dateTime(checkIn.text("checkedInAt"),language,zone) + " · " + tr("checkInMethod." + checkIn.text("method")), color = tone("bandText"), style = MaterialTheme.typography.bodySmall)
    }
}
@Composable fun CheckInWindow(event: JsonObject, language: String) {
    if (eventTime(event, "checkInOpensAt").isNotBlank() || eventTime(event, "checkInClosesAt").isNotBlank()) {
        SectionLabel(tr("events.window"))
        listOf("checkInOpensAt", "checkInClosesAt").forEach { key ->
            if (eventTime(event, key).isNotBlank()) Detail(tr(if (key == "checkInOpensAt") "uxMember.checkInOpens" else "uxMember.checkInCloses"), dateTime(eventTime(event, key), language, eventZone(event)))
        }
    }
}

@Composable fun Qr(value: String) {
    val bitmap = remember(value) {
        val matrix = com.google.zxing.qrcode.QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 672, 672, mapOf(com.google.zxing.EncodeHintType.ERROR_CORRECTION to com.google.zxing.qrcode.decoder.ErrorCorrectionLevel.M))
        Bitmap.createBitmap(matrix.width, matrix.height, Bitmap.Config.ARGB_8888).apply {
            val pixels = IntArray(matrix.width * matrix.height) { i -> if (matrix[i % matrix.width, i / matrix.width]) 0xff001836.toInt() else 0xffffffff.toInt() }
            setPixels(pixels, 0, matrix.width, 0, 0, matrix.width, matrix.height)
        }.asImageBitmap()
    }
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { Image(bitmap, tr("app.cardQrTitle"), Modifier.size(Space.qr).background(Color.White)) }
}
@Composable fun MemberCard(session: Session, api: Api, go: (String) -> Unit) = CardScreen(session, api, go)

@Composable fun Events(api: Api, go: (String) -> Unit, language: String, admin: Boolean = false, scan: Boolean = false, onCreate: (() -> Unit)? = null, session: Session? = null) {
    val staffBrowse = !admin && session != null && hasCapability(session, "city.operations") && !canParticipateInEvent(session)
    Title(tr(if (scan) "uxMember.chooseScanEvent" else if (admin) "app.adminEvents" else "app.tabEvents"))
    onCreate?.let { Action(tr("events.create"), onClick = it) }
    var all by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf(false) }
    val city = session?.me?.obj("member")?.obj("city")?.text("name").orEmpty()
    if (!admin && !staffBrowse) {
        if (city.isNotBlank()) Text(tr("uxMember.homeCity", "city" to city))
        // The row and labelled switch are one accessible touch target.
        Row(Modifier.fillMaxWidth().heightIn(min = Space.control).toggleable(all, role = androidx.compose.ui.semantics.Role.Switch) { all = it }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.gap)) { Switch(all, null); Text(tr("loyalty.national")) }
        Notice(tr(if (all) "uxMember.nationalOn" else "uxMember.nationalOff", "city" to city))
    }
    if (staffBrowse) Notice(tr("uxMember.staffEventScope"))
    Remote(api, eventBrowsePath(session, admin, all)) { data, reload ->
        val upcoming = data.rows("upcoming").filter { !staffBrowse || it.text("phase") != "draft" }
        val past = data.rows("past").filter { !staffBrowse || it.text("phase") != "draft" }
        val collection = upcoming + past
        val open = collection.filter { it.text("phase") == "open" }
        if (collection.isEmpty()) Empty(tr("app.eventsEmptyTitle"), tr(if (admin || staffBrowse) "uxMember.staffEventsEmpty" else if (all) "uxMember.nationalEventsEmpty" else "uxMember.eventsEmpty", "city" to city))
        else if (scan && open.isEmpty()) {
            Empty(tr("uxMember.noOpenScanEvent"), tr("uxMember.noOpenScanBody"))
            upcoming.firstOrNull { it.text("phase") == "upcoming" }?.let { next -> Tile {
                CardHeading(next.text("title"))
                Detail(tr("uxMember.checkInOpens"), dateTime(eventTime(next, "checkInOpensAt"), language, eventZone(next)))
                Text(next.obj("city").text("name") + " · " + next.obj("venue").text("name"))
                Action(tr("uxMember.viewEvent"), secondary = true) { go("city-event/" + next.text("id")) }
            } }
        }
        val groups = if (scan) listOf("uxMember.openForCheckIn" to open) else listOf("uxMember.upcoming" to upcoming, "uxMember.past" to past)
        groups.forEach { (heading, events) ->
            if (events.isNotEmpty()) SectionLabel(tr(heading))
            events.forEach { event -> Tile {
                EventPoster(api, event)
                CardHeading(event.text("title"))
                Text(event.obj("city").text("name") + " · " + event.obj("venue").text("name"))
                Detail(tr("uxMember.starts"), dateTime(eventTime(event, "startsAt"), language, eventZone(event)))
                Badge(tr("eventPhase." + event.text("phase")), event.text("phase"))
                if (event.obj("myCheckIn").isNotEmpty()) Badge(tr("app.resultCheckedIn"), "OPEN")
                Action(tr(if (scan) "app.adminScan" else "uxMember.viewEvent"), secondary = true) { go((if (scan) "scan/" else if (admin) "city-event/" else "event/") + event.text("id")) }
            } }
        }
        if (scan) Action(tr("uxMember.manageEvents"), secondary = true) { go("city-events") }
        Action(tr("common.retry"), secondary = true) { reload() }
    }
}
@Composable fun EventDetail(api: Api, id: String, language: String, go: (String) -> Unit, session: Session? = null) {
    val staffBrowse = session != null && hasCapability(session, "city.operations") && !canParticipateInEvent(session)
    Remote(api, (if (staffBrowse) "/api/admin/events/" else "/api/events/") + id, pollMs = 15_000) { data, reload ->
        val e = data.obj("event")
        val zone = eventZone(e)
        Title(e.text("title"), e.obj("city").text("name"))
        EventPoster(api, e)
        Tile {
            CardHeading(tr("uxMember.whenWhere"))
            Detail(tr("uxMember.starts"), dateTime(eventTime(e, "startsAt"), language, zone))
            Detail(tr("uxMember.ends"), dateTime(eventTime(e, "endsAt"), language, zone))
            if (e.obj("timing").flag("overnight")) Text(tr("ux.timing.overnight"), style = MaterialTheme.typography.bodySmall)
            Detail(tr("uxMember.venue"), e.obj("venue").text("name"))
            if (e.obj("venue").text("address").isNotBlank()) Text(e.obj("venue").text("address"))
            if (e.obj("poster").text("description", e.text("description")).isNotBlank()) Text(e.obj("poster").text("description", e.text("description")))
            Badge(tr("eventPhase." + e.text("phase")), e.text("phase"))
        }
        Tile { EventAttendance(session, e, go) }
        if (canParticipateInEvent(session)) {
            EventJourney(session!!, api, e, go, data.rows("journey"), data.obj("myReservation"), reload)
            if (e.text("phase") != "ended") {
                val reservation = data.obj("myReservation")
                if (reservation.isNotEmpty()) Tile {
                    CardHeading(tr("uxMember.reservation"))
                    Badge(tr("social." + reservation.text("status")), reservation.text("status"))
                    Text(reservation.text("slotCode"))
                    if (reservation.text("conversationId").isNotBlank()) Action(tr("uxMember.openBooking"), secondary = true) { go("conversation/" + reservation.text("conversationId")) }
                } else {
                    Action(tr("uxMember.reservation"), enabled = canUseEventAction(e, "reserve"), maroon = true) { go("reservation/$id") }
                    eventAction(e, "reserve").text("reason").takeIf { it.isNotBlank() }?.let { Notice(tr("ux.reason.$it")) }
                }
                if (eventIsOtherCity(session, e)) {
                    Action(tr("uxMember.visitAnotherCity"), enabled = canUseEventAction(e, "roaming"), secondary = true) { go("roaming/$id") }
                    eventAction(e, "roaming").text("reason").takeIf { it.isNotBlank() }?.let { Notice(tr("ux.reason.$it")) }
                }
            } else {
                Tile {
                    CardHeading(tr("uxMember.bonusXp"))
                    Text(tr("uxMember.bonusXpBody"))
                    Remote(api, "/api/loyalty/claims") { claims, _ ->
                        val mine = claims.rows("claims").filter { it.text("eventId") == id }
                        mine.forEach { claim -> Badge(tr("social." + claim.text("status")), claim.text("status")) }
                        if (mine.isNotEmpty()) Action(tr("uxMember.myClaims"), secondary = true) { go("claims/$id") }
                        else {
                            Action(tr("uxMember.claimBonusXp"), enabled = canUseEventAction(e, "claimXp"), secondary = true) { go("claims/$id") }
                            eventAction(e, "claimXp").text("reason").takeIf { it.isNotBlank() }?.let { Notice(tr("ux.reason.$it")) }
                        }
                    }
                }
            }
        } else if (staffBrowse) Action(tr("uxMember.openWorkspace"), secondary = true) { go("city-event/$id") }
        if (staffBrowse || canUseEventAction(e, "draw")) Action(tr(if (e.text("phase") == "ended") "uxMember.drawResult" else "phase5.draw"), secondary = true) { go("draw/$id") }
        else eventAction(e, "draw").text("reason").takeIf { it.isNotBlank() }?.let { Notice(tr("ux.reason.$it")) }
    }
}
@Composable fun History(api: Api, language: String) {
    Title(tr("app.historyTitle"))
    Remote(api, "/api/me/check-ins") { data, _ ->
        if (data.rows("checkIns").isEmpty()) Empty(tr("app.historyEmptyTitle"), tr("app.historyEmptyBody"))
        data.rows("checkIns").forEach { row -> Tile { Text(row.obj("event").text("title"), style = MaterialTheme.typography.titleMedium); Text(row.obj("event").text("venueName")); Text(dateTime(row.text("checkedInAt"), language, row.obj("event").obj("city").text("timezone", "Asia/Jakarta"))); Text(tr("checkInMethod." + row.text("method"))) } }
    }
}
fun notificationDestination(data: JsonObject, session: Session?, adminMode: Boolean, notificationKind: String = ""): String? {
    val staff = session != null && hasCapability(session, "city.operations")
    return when (data.text("screen")) {
        "event" -> data.text("eventId").takeIf { it.isNotBlank() }?.let { if (staff) "city-event/$it" else "event/$it" }
        "claims" -> if (staff && hasCapability(session!!, "promoter.manage")) "claims-review" else if (session == null || canParticipateInEvent(session)) "claims" else null
        "memberCard" -> if (session != null && hasCapability(session, "card.reportLost")) notificationRoute(data) else null
        "reservations" -> if (staff) "event-reservations/" + data.text("eventId") else "social-operations"
        "social-operations" -> when {
            !staff -> "social-operations"
            notificationKind == "reservationRequested" -> "event-reservations/" + data.text("eventId")
            data.text("eventId").isNotBlank() -> "city-event/" + data.text("eventId")
            else -> "tools" // Older notifications omit request type and event; keep crew out of the personal booking screen.
        }
        else -> notificationRoute(data)
    }
}

/** Server targets carry task context; permissions still come from the signed-in account. */
fun notificationTargetDestination(target: JsonObject, session: Session?, adminMode: Boolean = false): String? {
    if (session == null) return null
    val eventId = target.text("eventId")
    val member = canParticipateInEvent(session)
    val staff = isStaff(session)
    val need = when (target.text("screen")) {
        "adminReservations" -> "reservation.manage"
        "adminRoaming", "adminEvent", "adminEventContent" -> "city.operations"
        "adminClaims" -> "promoter.manage"
        "adminMemberCard" -> "card.reportLost"
        "adminContentQueue" -> "hq.manage"
        else -> null
    }
    if (need != null && !hasCapability(session, need)) return null
    if (target.flag("requiresAdminMode") && !staff) return null
    return when (target.text("screen")) {
        "event" -> eventId.takeIf { it.isNotBlank() }?.let { if (staff && (adminMode || !member)) "city-event/$it" else if (member) "event/$it" else null }
        "attendance" -> if (member) "history" else null
        "card" -> "card"
        "reservation" -> when {
            target.text("reservationId").isNotBlank() && member -> "booking/" + (if (eventId.isBlank()) "" else "$eventId/") + target.text("reservationId")
            target.text("conversationId").isNotBlank() && member -> "conversation/" + target.text("conversationId")
            member -> "my-reservations"
            staff -> "event-reservations/$eventId"
            else -> null
        }
        "conversation" -> target.text("conversationId").takeIf { it.isNotBlank() }?.let { "conversation/$it" }
        "hub" -> target.text("channelId").takeIf { it.isNotBlank() }?.let { "channel/$it" } ?: "hub"
        "roaming" -> if (member) "my-access" else null
        "claims" -> if (member) "claims/$eventId" + target.text("claimId").takeIf { it.isNotBlank() }?.let { "/$it" }.orEmpty() else null
        "adminReservations" -> "event-reservations/$eventId"
        "adminRoaming" -> if (target.text("requestId").isNotBlank()) "access-review/$eventId/" + target.text("requestId") else "event-roaming/$eventId"
        "adminClaims" -> "claims-review/$eventId"
        "adminMemberCard" -> if (target.text("memberId").isNotBlank()) "member-card/" + target.text("memberId") else "member-cards"
        "adminEventContent" -> eventId.takeIf { it.isNotBlank() }?.let { "event-content/$it" }
        "adminContentQueue" -> "content-approvals/" + target.text("submissionId")
        "adminEvent" -> if (eventId.isNotBlank()) "city-event/$eventId" else "city-events"
        else -> null
    }
}

fun notificationOpenRoute(destination: String, enterAdmin: Boolean, notificationId: String) =
    if (enterAdmin) "admin-open-notification/$notificationId/$destination" else destination

fun notificationActionKey(route: String?, enterAdmin: Boolean): String = when {
    enterAdmin -> "uxMember.enterAdminNotification"
    route == null -> "uxMember.readNotification"
    route.startsWith("event/") || route.startsWith("city-event/") -> "uxMember.viewEvent"
    route.startsWith("claims-review") -> "uxMember.reviewClaims"
    route.startsWith("claims") -> "uxMember.myClaims"
    route.startsWith("conversation/") || route.startsWith("social-operations") || route.startsWith("event-reservations/") -> "uxMember.openBooking"
    route.startsWith("channel/") || route == "hub" -> "uxMember.openCommunity"
    route.startsWith("member-card/") || route == "card" -> "uxMember.viewCard"
    route == "history" -> "uxMember.viewAttendance"
    route.startsWith("roaming") -> "uxMember.viewAccessRequest"
    route == "tools" -> "uxMember.reviewRequests"
    else -> "uxMember.openNotification"
}

@Composable fun Notifications(api: Api, language: String, go: (String) -> Unit, session: Session? = null, adminMode: Boolean = false) {
    Title(tr("app.notificationsTitle"))
    Action(tr("app.notificationSettingsTitle"), secondary = true) { go("notification-settings") }
    val mutation = rememberMutation(); MutationStatus(mutation)
    var readIds by remember { mutableStateOf(emptySet<String>()) }
    var opened by remember { mutableStateOf<JsonObject?>(null) }
    Remote(api, "/api/me/notifications") { data, reload ->
        val unread = data.rows("notifications").count { it.text("readAt").isBlank() && it.text("id") !in readIds }
        Action(tr("uxMember.markAllRead"), enabled = (data.number("unread") > 0 || unread > 0) && !mutation.busy, secondary = true) {
            mutation.run {
                api.request("POST", "/api/me/notifications/read", body("all" to true))
                readIds = readIds + data.rows("notifications").map { it.text("id") }
                reload()
            }
        }
        if (data.rows("notifications").isEmpty()) Empty(tr("app.notificationsEmptyTitle"), tr("app.notificationsEmptyBody"))
        data.rows("notifications").forEach { n -> Tile {
            Text(n.text("title"), style = MaterialTheme.typography.titleMedium)
            Text(n.text("body"), maxLines = 2, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
            Text(dateTime(n.text("sentAt"), language), style = MaterialTheme.typography.bodySmall)
            val isUnread = n.text("readAt").isBlank() && n.text("id") !in readIds
            if (isUnread) Badge(tr("app.notificationUnread"))
            val target = n.obj("target")
            val destination = if (target.isNotEmpty()) notificationTargetDestination(target, session, adminMode) else notificationDestination(n.obj("data"), session, adminMode, n.text("kind"))
            val enterAdmin = destination != null && !adminMode && (target.flag("requiresAdminMode") || operationalCapability(destination) != null) && session != null && isStaff(session)
            val actionKey = if (destination == null) "uxMember.readNotification" else if (enterAdmin) "ux.adminMode.openIn" else target.text("actionKey").takeIf { it.startsWith("ux.notifAction.") } ?: notificationActionKey(destination, false)
            Action(tr(actionKey), enabled = !mutation.busy, secondary = true) {
                mutation.run {
                    var resolved = destination
                    if (target.text("screen") == "adminRoaming" && target.text("requestId").isNotBlank()) resolved = resolveSocialAccessRoute(api, target.text("requestId"), target.text("eventId"))
                    if (isUnread && !(enterAdmin && resolved != null)) {
                        api.request("POST", "/api/me/notifications/" + query(n.text("id")) + "/read")
                        readIds = readIds + n.text("id")
                    }
                    reload()
                    if (resolved == null) opened = n else go(notificationOpenRoute(resolved, enterAdmin, n.text("id")))
                }
            }
        } }
    }
    opened?.let { n -> AlertDialog(onDismissRequest = { opened = null }, title = { Text(n.text("title")) }, text = { Column(Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState())) { Text(n.text("body")) } }, confirmButton = { TextButton({ opened = null }) { Text(tr("common.close")) } }) }
}
@Composable fun NotificationSettings(api: Api) {
    Title(tr("app.notificationSettingsTitle"), tr("app.notificationSettingsBody"))
    val mutation = rememberMutation(); MutationStatus(mutation)
    Remote(api, "/api/me/notification-prefs") { data, reload ->
        listOf("events", "activity").forEach { category ->
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                Text(tr("app.notifCategory.$category.title"), Modifier.weight(1f))
                Switch(data.obj("prefs").flag(category), { on -> mutation.run { api.request("PATCH", "/api/me/notification-prefs", body(category to on)); reload() } }, enabled = !mutation.busy)
            }
        }
    }
}
@Composable fun RegionChange(api: Api) {
    Title(tr("phase5.regionChange"), tr("phase5.regionHint"))
    val mutation = rememberMutation(); MutationStatus(mutation)
    var cityId by remember { mutableStateOf("") }; var reason by remember { mutableStateOf("") }
    Remote(api, "/api/me/region-change") { data, reload ->
        Choices(tr("app.city"), data.rows("cities").map { it.text("id") to it.text("name") }, cityId) { cityId = it }
        Field(tr("phase5.reason"), reason, { reason = it }, multiline = true)
        Decide(tr("phase5.regionChange"), tr("phase5.regionHint"), cityId.isNotBlank() && reason.trim().length >= 3 && !mutation.busy && data.rows("requests").none { it.text("status") == "PENDING" }) {
            mutation.run { api.request("POST", "/api/me/region-change", body("cityId" to cityId, "reason" to reason)); reason = ""; reload() }
        }
        if (data.rows("requests").isEmpty()) Notice(tr("phase5.regionEmpty"))
        data.rows("requests").forEach { row -> Tile { Text(row.obj("toCity").text("name")); Text(tr("social." + row.text("status"))); Text(row.text("decisionNote")) } }
    }
}
