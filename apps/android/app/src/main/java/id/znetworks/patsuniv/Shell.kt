package id.znetworks.patsuniv

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier

@Composable fun Shell(model: AppModel, session: Session, language: String, setLanguage: (String) -> Unit, offline: Boolean) {
    val admin = hasCapability(session, "city.operations")
    val home = if (admin) "tools" else "card"
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
            key(route) { Page {
                if (offline) Notice(tr("errors.network"))
                val kind = route.substringBefore('/'); val id = route.substringAfter('/', "")
                when(kind) {
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
                    "tools" -> { Brand(); Title(tr("app.adminTitle"), session.me.obj("user").text("name")); Action(tr("social.operations"), secondary = true) { go("social-operations") }; Action(tr("app.notificationsTitle"), secondary = true) { go("notifications") } }
                    else -> Notice(tr("errors.notFound"), true)
                }
            } }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Row(Modifier.fillMaxWidth().padding(Space.tiny)) { tabs.forEach { (target, title) -> TextButton({ stack.clear(); route = target }, Modifier.weight(1f), colors = ButtonDefaults.textButtonColors(contentColor = if (route == target) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)) { Text(tr(title), style = MaterialTheme.typography.bodySmall) } } }
    }
}
