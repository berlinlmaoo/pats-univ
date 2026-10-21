package id.znetworks.patsuniv

import android.app.Activity
import android.view.WindowManager
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonObject
import java.time.Instant

internal fun cardTokenDeadline(code: JsonObject, requestStartedElapsed: Long): Long {
    val validity = runCatching { Instant.parse(code.text("expiresAt")).toEpochMilli() - Instant.parse(code.text("serverTime")).toEpochMilli() }.getOrDefault(0)
    // Start at the request, so transport/server delay can only shorten the displayed lifetime.
    return requestStartedElapsed + validity.coerceAtLeast(0)
}

@Composable fun CardScreen(session: Session, api: Api, go: (String) -> Unit) {
    Title(tr("uxShell.cardTitle"))
    if (!hasPersonalMembership(session)) {
        Empty(tr("uxShell.noMembership"), tr("uxShell.noMembershipBody"))
        Action(tr("uxShell.account"), secondary = true) { go("profile") }; return
    }
    val member = session.me.obj("member")
    val context = LocalContext.current
    DisposableEffect(Unit) {
        (context as? Activity)?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose { (context as? Activity)?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
    }
    SectionLabel(tr("uxShell.digital"))
    val requestStarted = remember { longArrayOf(0L) }
    Remote(api, "/api/me/card-token", pollMs = 25_000, placeholder = { KtmCard(member) }, onRequestStarted = { requestStarted[0] = android.os.SystemClock.elapsedRealtime() }) { code, reload ->
        var remaining by remember(code) { mutableIntStateOf(0) }
        LaunchedEffect(code) {
            val deadline = cardTokenDeadline(code, requestStarted[0])
            while (true) { remaining = ((deadline - android.os.SystemClock.elapsedRealtime()) / 1000).toInt().coerceAtLeast(0); delay(1000) }
        }
        if (remaining > 0) Badge(tr("uxShell.ready"), "ACTIVE")
        KtmCard(member, code.text("token").takeIf { remaining > 0 })
        Notice(tr("uxShell.qrPurpose"))
        if (remaining > 0) {
            Text(tr("app.cardQrRefreshIn", "seconds" to remaining.toString()), style = MaterialTheme.typography.bodySmall)
            QrEnlarge(code.text("token"), member)
        } else { Notice(tr("app.cardQrOffline")); Action(tr("common.retry"), secondary = true) { reload() } }
    }
    SectionLabel(tr("uxShell.physical"))
    Tile {
        Text(tr("uxShell.physicalHint"))
        val status = member.text("cardStatus")
        val known = status in setOf("NOT_PRINTED", "IN_BATCH", "SENT_TO_VENDOR", "RECEIVED_HQ", "ENCODED", "DELIVERED", "REVOKED")
        Badge(tr(if (known) "uxShell.$status" else "uxShell.unknownStatus"), status)
        Text(tr("uxShell.physicalNext"))
        Detail(tr("app.nim"), member.text("nim"))
        Action(tr("uxShell.cardHelp"), secondary = true) { go("card-help") }
    }
}
