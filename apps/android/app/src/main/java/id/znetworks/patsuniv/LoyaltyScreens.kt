package id.znetworks.patsuniv

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.Alignment
import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import kotlinx.coroutines.delay
import kotlinx.serialization.json.*
import java.time.Instant

@Composable fun Wallet(session: Session, api: Api, language: String, go: (String) -> Unit, initialTab: String = "") {
    Title(tr("uxAdmin.xpRewards"))
    val live = liveVersion(api, "wallet", session.me.obj("member").text("id"))
    val mutation = rememberMutation(); MutationStatus(mutation)
    var eventId by remember { mutableStateOf("") }
    var issued by remember { mutableStateOf<JsonObject?>(null) }
    var issuedEvent by remember { mutableStateOf("") }
    var issuedCost by remember { mutableIntStateOf(0) }
    var selected by androidx.compose.runtime.saveable.rememberSaveable(initialTab) { mutableStateOf(if (initialTab == "activity") "activity" else "rewards") }
    val now = adminNow()
    Remote(api, "/api/loyalty/wallet", refresh = live, pollMs = 15000) { data, reload ->
        val activeCodes = data.rows("redemptions").filter { activeRewardCode(it, now) }
        if (activeCodes.isNotEmpty()) {
            Text(tr("uxAdmin.activeCodes"), style = MaterialTheme.typography.titleLarge)
            activeCodes.forEach { Redemption(it, language, reload) }
        }
        val events = data.rows("events")
        val event = events.find { it.text("id") == eventId } ?: if (eventId.isBlank()) events.firstOrNull() else null
        Tile {
            Text(tr("loyalty.balance")); Text(count(data.number("balance")) + " XP", style = MaterialTheme.typography.headlineLarge)
            val milestone = data.obj("milestone")
            if (milestone.isNotEmpty()) { Text(if (milestone.number("remaining") > 0) tr("loyalty.milestone", "remaining" to count(milestone.number("remaining")), "reward" to milestone.obj("reward").text("name")) else tr("uxAdmin.balanceEnough")); LinearProgressIndicator(progress = { (milestone["progress"] as? JsonPrimitive)?.floatOrNull?.coerceIn(0f, 1f) ?: 0f }, modifier = Modifier.fillMaxWidth(), color = tone("gold"), trackColor = tone("surfaceMuted")) }
            Text(tr(if (event == null) "uxAdmin.redeemNeedsCheckIn" else "uxAdmin.redeemEligible", "event" to event?.text("title").orEmpty()))
        }
        Tabs(listOf("rewards" to tr("uxAdmin.rewards"), "mine" to tr("uxAdmin.myRewards"), "activity" to tr("uxAdmin.xpActivity")), selected) { selected = it }
        when (selected) {
        "rewards" -> {
        Choices(tr("loyalty.selectEvent"), events.map { it.text("id") to it.text("title") }, event?.text("id").orEmpty()) { eventId = it }
        if (event == null) Notice(tr("uxAdmin.redeemNeedsCheckIn"))
        Text(tr("loyalty.catalogue"), style = MaterialTheme.typography.titleLarge)
        val rewards = data.rows("rewards").filter { it.text("type") == "DIRECT" && (event == null || it.text("venueId") == event.text("venueId")) }
        if (rewards.isEmpty()) Empty(tr("loyalty.emptyRewards"), tr("loyalty.emptyRewardsBody"))
        rewards.forEach { r -> Tile {
            Text(r.text("name"), style = MaterialTheme.typography.titleMedium); Text(r.text("description")); Text(count(r.number("xpCost")) + " XP")
            Text(if (r["stock"] == JsonNull) tr("loyalty.unlimited") else tr("loyalty.stockLeft", "count" to count(r.number("stock"))))
            Decide(tr("loyalty.redeem"), tr("uxAdmin.redeemConfirm", "reward" to r.text("name"), "cost" to count(r.number("xpCost")), "event" to event?.text("title").orEmpty()), !mutation.busy && event != null && data.number("balance") >= r.number("xpCost") && (r["stock"] == JsonNull || r.number("stock") > 0)) {
                mutation.run {
                    val response = api.request("POST", "/api/loyalty/redeem", body("eventId" to event!!.text("id"), "rewardId" to r.text("id")))
                    issuedEvent = event.text("title"); issuedCost = r.number("xpCost"); issued = response.obj("redemption").takeIf { it.isNotEmpty() }
                    reload()
                }
            }
        } }
        if (event != null) Action(tr("phase5.draw")) { go("draw/" + event.text("id")) }
        }
        "mine" -> {
            Text(tr("uxAdmin.myRewards"), style = MaterialTheme.typography.titleLarge)
            val history = data.rows("redemptions").filterNot { activeRewardCode(it, now) }
            if (history.isEmpty()) Empty(tr("loyalty.emptyCodes"), tr("loyalty.emptyCodesBody"))
            history.forEach { Redemption(it, language, reload) }
        }
        "activity" -> {
        Action(tr("uxAdmin.claimBonusXp"), secondary = true) { go("claims") }
        Action(tr("uxAdmin.myClaims"), secondary = true) { go("claims/history") }
        Text(tr("uxAdmin.claimBonusBody"))
        Action(tr("loyalty.leaderboard"), secondary = true) { go("leaderboard") }
        data.rows("expiring").forEach { row -> Text(tr("phase5.xpExpiry", "xp" to count(row.number("xp")), "date" to dateTime(row.text("expiresAt"), language)), style = MaterialTheme.typography.bodySmall) }
        Text(tr("loyalty.ledger"), style = MaterialTheme.typography.titleLarge)
        if (data.rows("ledger").isEmpty()) Empty(tr("loyalty.emptyLedger"), tr("loyalty.emptyLedgerBody"))
        data.rows("ledger").forEach { row -> Tile { Text((if (row.number("delta") > 0) "+" else "") + count(row.number("delta")) + " XP · " + tr("loyalty." + row.text("reason"))); Text(dateTime(row.text("createdAt"), language), style = MaterialTheme.typography.bodySmall) } }
        }
        }
        issued?.let { initial ->
            val current = data.rows("redemptions").find { it.text("id") == initial.text("id") } ?: initial
            Dialog(onDismissRequest = { issued = null }) {
                Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.background) {
                    Column(Modifier.fillMaxWidth().heightIn(max = 640.dp).verticalScroll(rememberScrollState()).padding(Space.page), verticalArrangement = Arrangement.spacedBy(Space.gap)) {
                        Text(tr("uxAdmin.rewardCodeReady"), style = MaterialTheme.typography.titleLarge)
                        Text(issuedEvent, style = MaterialTheme.typography.titleMedium)
                        Text(tr("uxAdmin.xpSpent", "cost" to count(issuedCost)))
                        Redemption(current, language, reload)
                        Action(tr("common.close"), secondary = true) { issued = null }
                    }
                }
            }
        }
    }
}
@Composable fun Redemption(r: JsonObject, language: String, reload: () -> Unit) {
    var seconds by remember(r) { mutableIntStateOf(runCatching { ((Instant.parse(r.text("expiresAt")).toEpochMilli() - System.currentTimeMillis()) / 1000).toInt().coerceAtLeast(0) }.getOrDefault(0)) }
    LaunchedEffect(r) {
        if (r.text("status") == "ISSUED") {
            do { seconds = runCatching { ((Instant.parse(r.text("expiresAt")).toEpochMilli() - System.currentTimeMillis()) / 1000).toInt().coerceAtLeast(0) }.getOrDefault(0); if (seconds > 0) delay(1000) } while (seconds > 0)
            reload()
        }
    }
    Tile {
        Text(r.obj("reward").text("name"), style = MaterialTheme.typography.titleMedium); Text(tr("loyalty." + r.text("status")))
        if (r.text("status") == "ISSUED" && seconds > 0) { Qr(r.text("code")); Text(r.text("code"), style = MaterialTheme.typography.headlineLarge); Text(tr("loyalty.countdown", "seconds" to count(seconds))); Text(tr("loyalty.codeHint")) }
        Text(tr("loyalty.expires", "time" to dateTime(r.text("expiresAt"), language)), style = MaterialTheme.typography.bodySmall)
    }
}
@Composable fun Draw(session: Session, api: Api, id: String, language: String) {
    val mutation = rememberMutation(); MutationStatus(mutation)
    val live = liveVersion(api, "draw", id)
    val staffSource = hasCapability(session, "city.operations")
    val admin = LocalAdminMode.current && hasCapability(session, "draw.manage")
    val now = adminNow()
    Remote(api, "/api/loyalty/draw?eventId=${query(id)}", refresh = live, pollMs = 15000) { d, reload ->
        // The current draw-state endpoint already accepts crew; metadata must use the staff event API.
        Remote(api, if (staffSource) "/api/admin/events/$id" else "/api/events/$id", pollMs = 15000) { eventState, _ ->
        val event = eventState.obj("event")
        val ended = event.text("phase") == "ended" || runCatching { now >= Instant.parse(event.text("endsAt")) }.getOrDefault(true)
        Title(tr("phase5.draw"), tr(if(ended) "native.endedDraw" else "phase5.drawHint"))
        if (staffSource) AdminEventContext(event, language)
        if(ended) {
            Tile {
                CardHeading(d.text("prize", tr("phase5.notConfigured")))
                val winner = d.rows("entries").find { it.text("id") == d.text("winnerEntryId") }
                Notice(if(winner == null) tr("ops.drawNotRunBody") else tr("phase5.drawWinner", "name" to winner.text("name")))
                d.rows("entries").forEach { entry -> Text(entry.text("name"), style = MaterialTheme.typography.bodyMedium) }
            }
        } else Tile {
            Text(d.text("prize", tr("phase5.notConfigured")), style = MaterialTheme.typography.titleLarge)
            if (d.text("peakStartsAt").isNotBlank()) Text(dateTime(d.text("peakStartsAt"), language) + " — " + dateTime(d.text("peakEndsAt"), language))
            Text("${count(d.rows("entries").size)} / ${count(d.number("capacity"))} · ${count(d.number("costXp"))} XP")
            if (d.obj("freeCredit").isNotEmpty()) Notice(tr("phase5.drawFree"))
            if(ended) Notice(tr("native.endedDraw"))
            if(!ended && d.rows("entries").isNotEmpty()) PrizeWheel(d.rows("entries"), d.text("winnerEntryId"), mutation.busy)
            else if(!ended) Column(verticalArrangement = Arrangement.spacedBy(Space.small)) { repeat(5) { OutlinedCard(Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.small) { Text(tr("ops.slotN", "n" to (it+1).toString()) + " · " + tr("ops.slotEmpty"), Modifier.padding(Space.gap), style = MaterialTheme.typography.labelSmall) } } }
            if (d.rows("entries").isEmpty()) Notice(tr("phase5.drawEmpty"))
            d.rows("entries").forEach { entry -> Text("${count(entry.number("position"))}. ${entry.text("name")}", style = MaterialTheme.typography.titleMedium) }
            d.rows("entries").find { it.text("id") == d.text("winnerEntryId") }?.let { Notice(tr("phase5.drawWinner", "name" to it.text("name"))) }
            if (admin && !canRunAdminDraw(event, d, now) && d.text("startedAt").isEmpty()) Notice(tr("uxAdmin.drawNotReady"))
            if (!ended && d.text("startedAt").isEmpty() && (admin || !staffSource)) Decide(tr(if (admin) "phase5.drawRun" else "phase5.drawEnter"), tr(if (admin) "phase5.drawConfirm" else "phase5.drawHint"), !mutation.busy && if (admin) canRunAdminDraw(event, d, now) else canEnterDraw(d, now), maroon = true) {
                mutation.run { api.request("POST", if (admin) "/api/admin/draw" else "/api/loyalty/spin", if (admin) body("eventId" to id, "action" to "run") else body("eventId" to id)); reload() }
            }
        }
    }
}
}
@Composable fun Leaderboard(api: Api, language: String, homeCityId: String = "") {
    Title(tr("loyalty.leaderboard"), tr("loyalty.earned"))
    var city by remember(homeCityId) { mutableStateOf(homeCityId) }; var national by remember(homeCityId) { mutableStateOf(homeCityId.isBlank()) }
    var month by remember { mutableStateOf("") }; var appliedMonth by remember { mutableStateOf("") }; var event by remember { mutableStateOf("") }
    Remote(api, "/api/loyalty/leaderboard?cityId=${query(if(national) "" else city)}&month=${query(appliedMonth)}&eventId=${query(event)}") { data, reload ->
        Tabs(listOf("city" to tr("loyalty.city"), "national" to tr("loyalty.national")), if(national) "national" else "city") { national = it == "national"; if(!national && city.isBlank()) city = data.rows("cities").firstOrNull()?.text("id").orEmpty() }
        if(!national) Choices(tr("loyalty.city"), data.rows("cities").map { it.text("id") to it.text("name") },city) { city = it }
        if(data.text("periodStart").isNotEmpty()) Text(leaderboardPeriod(data,language), color = tone("goldText"), style = MaterialTheme.typography.bodySmall)
        if (data.text("mode") in setOf("MONTHLY", "QUARTERLY")) { Field(tr("loyalty.month"), month, { month = it }); Action(tr("loyalty.apply"), month.isBlank() || Regex("^\\d{4}-(0[1-9]|1[0-2])$").matches(month), true) { appliedMonth = month } }
        if (data.text("mode") == "EVENT") Choices(tr("loyalty.event"), data.rows("events").map { it.text("id") to it.text("title") }, event) { event = it }
        if (data.obj("self").isNotEmpty()) Tile { Text(tr("loyalty.self") + ": " + count(data.obj("self").number("rank"))); Text(count(data.obj("self").number("xp")) + " XP") }
        if (data.rows("entries").isEmpty()) Empty(tr("loyalty.emptyRank"), tr("loyalty.emptyRankBody"))
        data.rows("entries").forEach { row -> Tile {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.gap)) {
                val rank = row.number("rank")
                Surface(color = when(rank) { 1 -> tone("gold"); 2 -> tone("surfaceMuted"); 3 -> tone("secondary"); else -> tone("surface") }, contentColor = when(rank) { 1 -> tone("band"); 3 -> tone("secondaryText"); else -> tone("text") }, shape = MaterialTheme.shapes.small) { Text(count(rank), Modifier.padding(Space.small), style = MaterialTheme.typography.labelSmall) }
                Column(Modifier.weight(1f)) { Text(row.text("name"), style = MaterialTheme.typography.titleMedium); Text(row.text("city"), style = MaterialTheme.typography.bodySmall) }
                Text(count(row.number("xp")) + " XP", style = MaterialTheme.typography.labelLarge)
            }
        } }
        Action(tr("common.retry"), secondary = true) { reload() }
    }
}
@Composable fun Claims(session: Session, api: Api, initialEventId: String = "") {
    Title(tr("uxAdmin.claimBonusXp"), tr("uxAdmin.claimBonusBody"))
    var claimTab by remember(initialEventId) { mutableStateOf(if (initialEventId == "history") "history" else "pending") }
    var eventId by remember(initialEventId) { mutableStateOf(if (initialEventId == "history") "" else initialEventId) }; var form by remember { mutableStateOf("MEMBER") }; var editing by remember { mutableStateOf<JsonObject?>(null) }
    var guests by remember { mutableStateOf("0") }; var reservations by remember { mutableStateOf("0") }; var notes by remember { mutableStateOf("") }; var receipt by remember { mutableStateOf("") }
    val mutation = rememberMutation(); MutationStatus(mutation)
    val live = liveVersion(api, "wallet", session.me.obj("member").text("id"))
    fun clear() { editing = null; guests = "0"; reservations = "0"; notes = ""; receipt = "" }
    Remote(api, "/api/loyalty/claims", refresh = live) { data, reload ->
        LaunchedEffect(data.flag("isPromoter")) { if (!data.flag("isPromoter") && form == "PR") { form = "MEMBER"; clear() } }
        val event = data.rows("events").find { it.text("id") == eventId } ?: if (eventId.isBlank()) data.rows("events").firstOrNull() else null
        Choices(tr("loyalty.event"), data.rows("events").map { it.text("id") to it.text("title") }, event?.text("id").orEmpty()) { eventId = it; clear() }
        if (event == null) Notice(tr(if (eventId.isNotBlank() && data.rows("events").isNotEmpty()) "uxAdmin.claimEventUnavailable" else "loyalty.noPastEvents")) else {
            if (data.flag("isPromoter")) Choices(tr("phase5.claimForm"), listOf("MEMBER" to tr("phase5.claimMember"), "PR" to tr("phase5.claimPr")), form) { form = it; clear() }
            val existing = data.rows("claims").find { it.text("eventId") == event.text("id") && it.text("formType") == form }
            if (existing == null || (existing.text("status") == "PENDING" && existing.text("id") == editing?.text("id"))) Tile {
                if (form == "PR" || data.flag("allowMemberGl")) Field(tr("phase5.guestCount"), guests, { guests = it }, KeyboardType.Number)
                Field(tr("phase5.reservationCount"), reservations, { reservations = it }, KeyboardType.Number)
                Field(tr("phase5.reason"), notes, { notes = it }, multiline = true)
                ReceiptCapture(api, receipt) { receipt = it }
                Action(tr(if (editing == null) "phase5.claimSubmit" else "common.save"), !mutation.busy && validCount(guests) && validCount(reservations) && notes.length <= 2000) {
                    mutation.run { var payload = body("eventId" to event.text("id"), "formType" to form, "guestCount" to if (form == "PR" || data.flag("allowMemberGl")) guests.toInt() else 0, "reservationCount" to reservations.toInt(), "receiptUrl" to receipt, "notes" to notes); editing?.let { payload = JsonObject(payload + ("id" to JsonPrimitive(it.text("id")))) }; api.request(if (editing == null) "POST" else "PATCH", "/api/loyalty/claims", payload); clear(); mutation.notice = "phase5.claimPending"; reload() }
                }
                if (editing != null) Action(tr("common.cancel"), secondary = true) { clear() }
            }
        }
        Text(tr("uxAdmin.myClaims"), style = MaterialTheme.typography.titleLarge)
        Tabs(listOf("pending" to tr("native.pending"), "history" to tr("native.history")), claimTab, mapOf("pending" to data.rows("claims").count { it.text("status") == "PENDING" })) { claimTab = it }
        val visibleClaims = data.rows("claims").filter { (it.text("status") == "PENDING") == (claimTab == "pending") }
        if(visibleClaims.isEmpty()) Empty(tr("phase5.claimEmpty"), tr("phase5.claimBody"))
        visibleClaims.forEach { c -> Tile {
            Text(c.obj("event").text("title"), style = MaterialTheme.typography.titleMedium); Text(tr(if (c.text("formType") == "PR") "phase5.claimPr" else "phase5.claimMember") + " · " + tr("social." + c.text("status")))
            if (c.text("notes").isNotBlank()) Text(c.text("notes"))
            Text(tr("phase5.guestCount") + ": " + count(c.number("guestCount"))); Text(tr("phase5.reservationCount") + ": " + count(c.number("reservationCount")))
            if (c["bonusValue"] != null && c["bonusValue"] != JsonNull) Text(count(c.number("bonusValue")) + " XP")
            if (c.text("rejectReason").isNotBlank()) Notice(c.text("rejectReason"), true)
            if (c.text("receiptUrl").isNotBlank()) {
                var viewedReceipt by remember(c.text("id")) { mutableStateOf("") }
                val receiptMutation = rememberMutation()
                Action(tr("loyalty.viewReceipt"), !receiptMutation.busy, true) { receiptMutation.run {
                    viewedReceipt = api.request("GET", "/api/loyalty/claims/${c.text("id")}/receipt?format=json").text("url")
                } }
                MutationStatus(receiptMutation)
                if (viewedReceipt.isNotBlank()) NetworkImage(api, viewedReceipt)
            }
            if (c.text("status") == "PENDING") Action(tr("common.edit"), secondary = true) { editing = c; eventId = c.text("eventId"); form = c.text("formType"); guests = c.text("guestCount"); reservations = c.text("reservationCount"); receipt = c.text("receiptUrl"); notes = c.text("notes") }
        } }
    }
}
