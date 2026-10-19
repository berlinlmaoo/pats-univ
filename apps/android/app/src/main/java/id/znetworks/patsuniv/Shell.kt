package id.znetworks.patsuniv

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.Alignment
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.Color
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import android.app.Activity

@Composable fun Shell(model: AppModel, session: Session, language: String, setLanguage: (String) -> Unit, offline: Boolean) {
    val admin = hasCapability(session, "city.operations")
    var pendingClaims by remember { mutableIntStateOf(0) }
    LaunchedEffect(session.me.obj("user").text("id")) {
        if(hasCapability(session, "promoter.manage")) while(true) {
            pendingClaims = try { model.api.request("GET", "/api/admin/loyalty/claims").rows("claims").count { it.text("status") == "PENDING" } } catch(e: kotlinx.coroutines.CancellationException) { throw e } catch(_: Exception) { 0 }
            kotlinx.coroutines.delay(15000)
        }
    }
    val home = if (admin) "tools" else "home"
    val activity = LocalContext.current as Activity
    val reader = remember(activity) { AndroidCardReader(activity) }
    var route by rememberSaveable(session.me.obj("user").text("id")) { mutableStateOf(home) }
    var selectedHubChannel by rememberSaveable(session.me.obj("user").text("id")) { mutableStateOf("") }
    val stack = remember { mutableStateListOf<String>() }
    fun go(next: String) { if (next != route) { stack.add(route); route = next } }
    fun back() { route = if (stack.isEmpty()) home else stack.removeAt(stack.lastIndex) }
    LaunchedEffect(model.requestedRoute) { model.requestedRoute?.let { go(it); model.requestedRoute = null } }
    val tabs = if (admin) listOf("tools" to "app.tabAdmin", "hub" to "app.tabHub", "profile" to "app.tabProfile") else listOf("home" to "native.home", "events" to "app.tabEvents", "card" to "app.tabCard", "hub" to "app.tabHub", "profile" to "app.tabProfile")
    val activeTab = when(route.substringBefore('/')) {
        "home", "events", "card", "hub", "profile", "tools" -> route
        "channel", "conversation", "social-hub", "social-operations" -> "hub"
        "notifications", "notification-settings", "region-change" -> "profile"
        else -> if(admin) "tools" else when(route.substringBefore('/')) { "event", "reservation", "roaming" -> "events"; else -> "home" }
    }
    BackHandler(route != home || stack.isNotEmpty()) { back() }
    Column(Modifier.background(MaterialTheme.colorScheme.background)) {
        Row(Modifier.fillMaxWidth().background(tone("band")).padding(horizontal = Space.page, vertical = Space.small), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.gap)) {
            Image(painterResource(R.drawable.official_crest), tr("common.appName"), Modifier.size(40.dp))
            Text(tr("common.appName").uppercase(), Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, color = tone("bandText"))
            LanguageToggle(language, true, setLanguage)
        }
        Box(Modifier.fillMaxWidth().height(3.dp).background(tone("gold")))
        if (tabs.none { it.first == route }) Row(Modifier.fillMaxWidth().padding(horizontal = Space.page)) { TextButton({ back() }) { Text(tr("common.back")) } }
        Box(Modifier.weight(1f)) {
            key(route) { Page(onRefresh = { try { model.api.reload(); model.offline = false } catch(e: kotlinx.coroutines.CancellationException) { throw e } catch(e: Exception) { model.offline = true; throw e } }) {
                if (offline) Notice(tr("errors.network"))
                val kind = route.substringBefore('/'); val id = route.substringAfter('/', "")
                val needs = when(kind) { "scan", "manual", "city-events", "city-event", "event-new", "event-edit" -> "checkin.scan"; "handover" -> "card.handover"; "member-cards", "member-card" -> "card.reportLost"; "encode", "encode-run" -> "card.encode"; "reencode" -> "card.requestReencode"; "reward-validation" -> "reward.validate"; "claims-review" -> "promoter.manage"; "operations", "crew" -> "city.operations"; else -> null }
                // Member-only screens need a member profile; admin-only screens need the capability.
                val memberOnly = kind in setOf("home", "card", "wallet", "claims", "promoter", "region-change", "roaming", "reservation")
                val denied = (needs != null && !hasCapability(session, needs)) || (memberOnly && (admin || session.me.obj("member").isEmpty())) || (kind == "tools" && !admin)
                if (denied) Notice(tr("errors.forbidden"), true) else when(kind) {
                    "home" -> MemberHome(session, model.api, ::go)
                    "card" -> MemberCard(session, model.api, ::go)
                    "events" -> Events(model.api, ::go, language)
                    "event" -> EventDetail(model.api, id, language, ::go)
                    "history" -> History(model.api, language)
                    "wallet" -> Wallet(session, model.api, language, ::go)
                    "leaderboard" -> Leaderboard(model.api, language)
                    "claims", "promoter" -> Claims(session, model.api)
                    "draw" -> Draw(session, model.api, id, language)
                    "region-change" -> RegionChange(model.api)
                    "roaming" -> Roaming(session, model.api, id, ::go)
                    "reservation" -> Reservation(model.api, id, ::go)
                    "hub", "social-hub" -> Hub(session, model.api, { next -> if(next.startsWith("channel/")) selectedHubChannel = next.substringAfter('/'); go(next) }, selectedChannel = selectedHubChannel)
                    "channel", "conversation" -> Channel(session, model.api, id, kind == "conversation", language, BuildConfig.DEBUG && model.qaCapture)
                    "social-operations" -> SocialOperations(session, model.api, language, ::go)
                    "notifications" -> Notifications(model.api, language, ::go)
                    "notification-settings" -> NotificationSettings(model.api)
                    "profile" -> Profile(session, model.api, language, setLanguage, ::go)
                    "tools" -> AdminTools(session, ::go)
                    "scan" -> if (id.isEmpty()) Events(model.api, ::go, language, admin = true, scan = true) else Scan(model.api, reader, id, false, ::go)
                    "manual" -> Scan(model.api, reader, id, true, ::go)
                    "city-events" -> Events(model.api, ::go, language, admin = true, onCreate = if (session.me.obj("user").obj("city").isNotEmpty()) ({ go("event-new") }) else null)
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
        Row(Modifier.fillMaxWidth().background(tone("band")).selectableGroup()) {
            tabs.forEach { (target, title) ->
                val selected = activeTab == target
                Column(Modifier.weight(1f).selectable(selected, role = Role.Tab, onClick = { stack.clear(); route = target }).padding(bottom = Space.small), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(Modifier.fillMaxWidth().height(3.dp).background(if(selected) tone("gold") else Color.Transparent))
                    Box(Modifier.padding(top = Space.small, bottom = Space.tiny).size(32.dp).background(if(target == "card") tone("secondary") else Color.Transparent, MaterialTheme.shapes.medium), contentAlignment = Alignment.Center) { PatsIcon(target, tone(if(selected || target == "card") "bandText" else "bandMuted")) }
                    Row(Modifier.fillMaxWidth().padding(horizontal = Space.tiny), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.tiny)) {
                        FitTabLabel(tr(title), tone(if(selected) "bandText" else "bandMuted"), Modifier.weight(1f))
                        if(target == "tools" && pendingClaims > 0) CountChip(pendingClaims)
                    }
                }
            }
        }
    }
}
