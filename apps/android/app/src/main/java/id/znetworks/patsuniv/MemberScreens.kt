package id.znetworks.patsuniv

import android.app.Activity
import android.view.WindowManager
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
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
@Composable fun MemberCard(session: Session, api: Api, go: (String) -> Unit) {
    val member = session.me.obj("member")
    val language = LocalLanguage.current
    val context = LocalContext.current
    DisposableEffect(Unit) { (context as? Activity)?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); onDispose { (context as? Activity)?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) } }
    Title(tr("app.cardTitle"))
    Remote(api, "/api/me/card-token", pollMs = 25_000) { code, reload ->
        var remaining by remember(code) { mutableIntStateOf(code.number("ttlSeconds")) }
        LaunchedEffect(code) { val expiry = runCatching { Instant.parse(code.text("expiresAt")).toEpochMilli() - Instant.parse(code.text("serverTime")).toEpochMilli() }.getOrDefault(0); val deadline = android.os.SystemClock.elapsedRealtime() + expiry; while (isActive) { remaining = ((deadline - android.os.SystemClock.elapsedRealtime()) / 1000).toInt().coerceAtLeast(0); delay(1000) } }
        KtmCard(member, code.text("token").takeIf { remaining > 0 })
        if(remaining > 0) {
            LinearProgressIndicator(progress = { (remaining.toFloat() / code.number("ttlSeconds").coerceAtLeast(1)).coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth(), color = tone("gold"), trackColor = tone("surfaceMuted"))
            Text(tr("app.cardQrRefreshIn", "seconds" to remaining.toString()), style = MaterialTheme.typography.bodySmall)
            QrEnlarge(code.text("token"))
        } else { Notice(tr("app.cardQrOffline")); Action(tr("common.retry")) { reload() } }
    }
    Badge(tr("cardStatusMember." + member.text("cardStatus")), member.text("cardStatus"))
    Tile { Detail(tr("app.nim"), member.text("nim")); Detail(tr("app.song"), member.text("favoriteSong")); Detail(tr("app.quotes"), member.text("quotes")) }

    Remote(api, "/api/me/check-ins") { data, _ ->
        Text(if (data.rows("checkIns").isEmpty()) tr("app.attendanceNone") else tr("app.attendanceCount", "count" to count(data.rows("checkIns").size)))
        Action(tr("app.historyTitle"), secondary = true) { go("history") }
    }
    Remote(api, "/api/me/notifications") { data, _ ->
        Text(if (data.number("unread") > 0) tr("app.notificationsUnread", "count" to count(data.number("unread"))) else tr("app.notificationsNone"))
        Action(tr("app.notificationsTitle"), secondary = true) { go("notifications") }
    }
}
@Composable fun Events(api: Api, go: (String) -> Unit, language: String, admin: Boolean = false, scan: Boolean = false) {
    Title(tr(if (admin) "app.adminEvents" else "app.tabEvents"))
    var all by remember { mutableStateOf(false) }
    if (!admin) Row(verticalAlignment = Alignment.CenterVertically) { Switch(all, { all = it }); Text(tr("loyalty.national")) }
    Remote(api, if (admin) "/api/admin/events" else "/api/events" + if (all) "?scope=all" else "") { data, reload ->
        val events = (data.rows("upcoming") + data.rows("past")).filter { !scan || it.text("phase") == "open" }
        if (events.isEmpty()) Empty(tr("app.eventsEmptyTitle"), tr("app.eventsEmptyBody", "city" to ""))
        events.forEach { event -> Tile {
            if(event.text("flyerUrl").isNotBlank()) NetworkImage(api, event.text("flyerUrl"))
            CardHeading(event.text("title"))
            Text(dateTime(event.text("startsAt"), language, event.obj("city").text("timezone", "Asia/Jakarta")))
            Text(event.obj("venue").text("name")); Badge(tr("eventPhase." + event.text("phase")), event.text("phase"))
            if (event.obj("myCheckIn").isNotEmpty()) Notice(tr("app.resultCheckedIn"))
            Action(tr(if (scan) "app.adminScan" else "common.continue"), secondary = true) { go((if (scan) "scan/" else if (admin) "city-event/" else "event/") + event.text("id")) }
        } }
        Action(tr("common.retry"), secondary = true) { reload() }
    }
}
@Composable fun EventDetail(api: Api, id: String, language: String, go: (String) -> Unit) {
    Remote(api, "/api/events/$id") { data, _ ->
        val e = data.obj("event")
        Title(e.text("title"), e.obj("city").text("name"))
        if (e.text("flyerUrl").isNotBlank()) NetworkImage(api, e.text("flyerUrl"))
        Tile {
            Text(dateTime(e.text("startsAt"), language, e.obj("city").text("timezone", "Asia/Jakarta")))
            Text(dateTime(e.text("endsAt"), language, e.obj("city").text("timezone", "Asia/Jakarta")))
            Text(e.obj("venue").text("name")); Text(e.obj("venue").text("address")); Text(e.text("description"))
            Badge(tr("eventPhase." + e.text("phase")), e.text("phase"))
            if(e.obj("myCheckIn").isNotEmpty()) CheckInStrip(e.obj("myCheckIn"), language, e.obj("city").text("timezone", "Asia/Jakarta"))
        }
        Action(tr("social.reserve"), maroon = true) { go("reservation/$id") }
        Action(tr("social.roaming"), secondary = true) { go("roaming/$id") }
        Action(tr("phase5.draw"), secondary = true) { go("draw/$id") }
    }
}
@Composable fun History(api: Api, language: String) {
    Title(tr("app.historyTitle"))
    Remote(api, "/api/me/check-ins") { data, _ ->
        if (data.rows("checkIns").isEmpty()) Empty(tr("app.historyEmptyTitle"), tr("app.historyEmptyBody"))
        data.rows("checkIns").forEach { row -> Tile { Text(row.obj("event").text("title"), style = MaterialTheme.typography.titleMedium); Text(row.obj("event").text("venueName")); Text(dateTime(row.text("checkedInAt"), language, row.obj("event").obj("city").text("timezone", "Asia/Jakarta"))); Text(tr("checkInMethod." + row.text("method"))) } }
    }
}
@Composable fun Notifications(api: Api, language: String, go: (String) -> Unit) {
    Title(tr("app.notificationsTitle"))
    Action(tr("app.notificationSettingsTitle"), secondary = true) { go("notification-settings") }
    Remote(api, "/api/me/notifications") { data, _ ->
        LaunchedEffect(data) { if (data.number("unread") > 0) runCatching { api.request("POST", "/api/me/notifications/read", body("all" to true)) } }
        if (data.rows("notifications").isEmpty()) Empty(tr("app.notificationsEmptyTitle"), tr("app.notificationsEmptyBody"))
        data.rows("notifications").forEach { n -> Tile {
            Text(n.text("title"), style = MaterialTheme.typography.titleMedium); Text(n.text("body")); Text(dateTime(n.text("sentAt"), language), style = MaterialTheme.typography.bodySmall)
            if (n.text("readAt").isBlank()) Text(tr("app.notificationUnread"), style = MaterialTheme.typography.bodySmall)
            notificationRoute(n.obj("data"))?.let { route -> Action(tr("common.continue"), secondary = true) { go(route) } }
        } }
    }
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
