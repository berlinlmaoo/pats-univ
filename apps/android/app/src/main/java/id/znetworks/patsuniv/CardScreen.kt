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
import kotlinx.serialization.json.JsonPrimitive
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
    Remote(api, "/api/me/card", pollMs = 30_000, placeholder = { KtmCard(member) }) { state, _ ->
        val face = state.obj("face")
        val artworkMember = JsonObject(member + mapOf(
            "fullName" to JsonPrimitive(face.text("name", member.text("fullName"))),
            "favoriteDrink" to JsonPrimitive(face.text("favoriteDrink", member.text("favoriteDrink"))),
            "quotes" to JsonPrimitive(face.text("quote", member.text("quotes")))
        ))
        SectionLabel(tr("ux.card.digitalTitle"))
        if (state.obj("digital").flag("ready")) LiveCardCode(api, artworkMember)
        else { KtmCard(artworkMember); Notice(tr("ux.card.digitalInactive")) }
        SectionLabel(tr("ux.card.physicalTitle"))
        Tile {
            Text(tr("uxShell.physicalHint"))
            val physical = state.obj("physical")
            val stage = physical.text("stage")
            val known = stage in setOf("queued", "printing", "atHq", "encoded", "shipped", "delivered", "inactive")
            Badge(tr(if (known) "ux.card.stage.$stage" else "uxShell.unknownStatus", "city" to member.obj("city").text("name")), physical.text("status"))
            if (physical.text("batchLabel").isNotBlank()) Text(physical.text("batchLabel"))
            val fee = physical.obj("replacementFee")
            if (fee.isNotEmpty()) Notice(if (fee.text("paidAt").isNotBlank()) tr("ux.card.feePaid", "date" to dateTime(fee.text("paidAt"), LocalLanguage.current)) else tr("ux.card.feeDue", "amount" to money(fee.number("amount"))))
            Detail(tr("app.nim"), member.text("nim"))
            Action(tr("uxShell.cardHelp"), secondary = true) { go("card-help") }
        }
    }
}

@Composable private fun LiveCardCode(api: Api, member: JsonObject) {
    val requestStarted = remember { longArrayOf(0L) }
    Remote(api, "/api/me/card-token", pollMs = 25_000, placeholder = { KtmCard(member) }, onRequestStarted = { requestStarted[0] = android.os.SystemClock.elapsedRealtime() }) { code, reload ->
        var remaining by remember(code) { mutableIntStateOf(0) }
        LaunchedEffect(code) {
            val deadline = cardTokenDeadline(code, requestStarted[0])
            while (true) { remaining = ((deadline - android.os.SystemClock.elapsedRealtime()) / 1000).toInt().coerceAtLeast(0); delay(1000) }
        }
        if (remaining > 0) {
            Badge(tr("uxShell.ready"), "ACTIVE")
            QrEnlarge(code.text("token"), member, remainingSeconds = remaining)
            Text(tr("app.cardQrRefreshIn", "seconds" to remaining.toString()), style = MaterialTheme.typography.bodySmall)
        } else { Notice(tr("app.cardQrOffline")); Action(tr("common.retry"), secondary = true) { reload() } }
        KtmCard(member, code.text("token").takeIf { remaining > 0 })
        Notice(tr("uxShell.qrPurpose"))
    }
}
