package id.znetworks.patsuniv

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import android.app.Activity

@Composable fun Shell(model: AppModel, session: Session, language: String, setLanguage: (String) -> Unit, offline: Boolean) {
    val admin = hasCapability(session, "city.operations")
    val home = if (admin) "tools" else "card"
    val activity = LocalContext.current as Activity
    val reader = remember(activity) { AndroidCardReader(activity) }
    var route by rememberSaveable(session.me.obj("user").text("id")) { mutableStateOf(home) }
    val stack = remember { mutableStateListOf<String>() }
    fun go(next: String) { if (next != route) { stack.add(route); route = next } }
    fun back() { route = if (stack.isEmpty()) home else stack.removeAt(stack.lastIndex) }
    LaunchedEffect(model.requestedRoute) { model.requestedRoute?.let { go(it); model.requestedRoute = null } }
    val tabs = if (admin) listOf("tools" to "app.tabAdmin", "hub" to "app.tabHub", "profile" to "app.tabProfile") else listOf("card" to "app.tabCard", "events" to "app.tabEvents", "wallet" to "app.tabRewards", "hub" to "app.tabHub", "profile" to "app.tabProfile")
    BackHandler(route != home || stack.isNotEmpty()) { back() }
    Column {
        if (tabs.none { it.first == route }) Row(Modifier.fillMaxWidth().padding(horizontal = Space.page)) { TextButton({ back() }) { Text(tr("common.back")) } }
        Box(Modifier.weight(1f)) {
            key(route) { Page(onRefresh = { try { model.api.reload(); model.offline = false } catch(e: kotlinx.coroutines.CancellationException) { throw e } catch(e: Exception) { model.offline = true; throw e } }) {
                if (offline) Notice(tr("errors.network"))
                val kind = route.substringBefore('/'); val id = route.substringAfter('/', "")
                val needs = when(kind) { "scan", "manual", "city-events", "city-event", "event-new", "event-edit" -> "checkin.scan"; "handover" -> "card.handover"; "member-cards", "member-card" -> "card.reportLost"; "encode", "encode-run" -> "card.encode"; "reencode" -> "card.requestReencode"; "reward-validation" -> "reward.validate"; "claims-review" -> "promoter.manage"; "operations", "crew" -> "city.operations"; else -> null }
                if (needs != null && !hasCapability(session, needs)) Notice(tr("errors.forbidden"), true) else when(kind) {
                    "card" -> if (!admin) MemberCard(session, model.api, ::go)
                    "events" -> Events(model.api, ::go, language)
                    "event" -> EventDetail(model.api, id, language, ::go)
                    "history" -> History(model.api, language)
                    "wallet" -> if (!admin) Wallet(session, model.api, language, ::go)
                    "leaderboard" -> Leaderboard(model.api, language)
                    "claims", "promoter" -> if (!admin) Claims(session, model.api)
                    "draw" -> Draw(session, model.api, id, language)
                    "region-change" -> if (!admin) RegionChange(model.api)
                    "roaming" -> if (!admin) Roaming(session, model.api, id, ::go)
                    "reservation" -> if (!admin) Reservation(model.api, id, ::go)
                    "hub", "social-hub" -> Hub(session, model.api, ::go)
                    "channel", "conversation" -> Channel(session, model.api, id, kind == "conversation", language, BuildConfig.DEBUG && model.qaCapture)
                    "social-operations" -> SocialOperations(session, model.api, language, ::go)
                    "notifications" -> Notifications(model.api, language, ::go)
                    "notification-settings" -> NotificationSettings(model.api)
                    "profile" -> Profile(session, model.api, language, setLanguage, ::go)
                    "tools" -> AdminTools(session, ::go)
                    "scan" -> if (id.isEmpty()) Events(model.api, ::go, language, admin = true, scan = true) else Scan(model.api, reader, id, false, ::go)
                    "manual" -> Scan(model.api, reader, id, true, ::go)
                    "city-events" -> { if (session.me.obj("user").obj("city").isNotEmpty()) Action(tr("events.create")) { go("event-new") }; Events(model.api, ::go, language, admin = true) }
                    "city-event" -> AdminEventDetail(session, model.api, id, language, ::go)
                    "event-new" -> EventEditor(model.api, "", ::go)
                    "event-edit" -> EventEditor(model.api, id, ::go)
                    "handover" -> Handover(model.api, reader)
                    "member-cards" -> MemberCards(model.api, ::go)
                    "member-card" -> MemberCardDetail(session, model.api, id, language, ::go)
                    "encode" -> EncodeHome(model.api, ::go)
                    "encode-run" -> EncodeRun(model.api, reader, batchId = id)
                    "reencode" -> EncodeRun(model.api, reader, grantId = id.substringBefore('/'), initialLookup = id.substringAfter('/', ""))
                    "reward-validation" -> RewardValidation(model.api)
                    "claims-review" -> ClaimsReview(model.api)
                    "operations", "crew" -> CrewOperations(model.api, ::go)
                    else -> Notice(tr("errors.notFound"), true)
                }
            } }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Row(Modifier.fillMaxWidth().padding(Space.tiny)) { tabs.forEach { (target, title) -> TextButton({ stack.clear(); route = target }, Modifier.weight(1f).heightIn(min = Space.control), contentPadding = PaddingValues(horizontal = Space.tiny / 2, vertical = Space.small), colors = ButtonDefaults.textButtonColors(contentColor = if (route == target) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)) { Text(tr(title), style = MaterialTheme.typography.labelMedium, maxLines = 1, softWrap = false) } } }
    }
}
