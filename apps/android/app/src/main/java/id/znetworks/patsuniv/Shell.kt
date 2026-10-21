package id.znetworks.patsuniv

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp

@Composable fun Shell(model: AppModel, session: Session, language: String, setLanguage: (String) -> Unit, offline: Boolean) {
    val activity = LocalContext.current as Activity
    val preferences = remember { activity.getSharedPreferences("ux-preferences", 0) }
    val accountId = session.me.obj("user").text("id")
    val staff = isStaff(session)
    var adminMode by rememberSaveable(accountId) { mutableStateOf(staff && preferences.getString("activeAccount", "") == accountId && preferences.getBoolean("adminMode", false)) }
    var route by rememberSaveable(accountId) { mutableStateOf("home") }
    var selectedHubChannel by rememberSaveable(accountId) { mutableStateOf("") }
    var pendingAdminRoute by rememberSaveable(accountId) { mutableStateOf<String?>(null) }
    val stack = remember(accountId) { mutableStateListOf<String>() }
    val tabLocations = remember(accountId) { mutableStateMapOf<String, String>() }
    val tabStacks = remember(accountId) { mutableStateMapOf<String, List<String>>() }
    val screenState = rememberSaveableStateHolder()
    val visited = remember(accountId) { mutableSetOf<String>() }
    val reader = remember(activity) { AndroidCardReader(activity) }
    val city = session.me.obj("user").obj("city").text("name")
    val scope = if (hasCapability(session, "hq.manage")) "HQ · " + tr("uxShell.allCities") else tr("uxShell.adminMode") + " · " + city
    LaunchedEffect(accountId, staff) {
        if (preferences.getString("activeAccount", "") != accountId || !staff) adminMode = false
        preferences.edit().putString("activeAccount", accountId).putBoolean("adminMode", adminMode).apply()
    }
    fun navigate(next: String) {
        val need = operationalCapability(next)
        if (need != null && staff && hasCapability(session, need) && !adminMode) { pendingAdminRoute = next; return }
        if (next != route) { stack.add(route); tabLocations[routeTab(route)] = route; route = next }
    }
    fun back() { route = if (stack.isEmpty()) "home" else stack.removeAt(stack.lastIndex) }
    fun setMode(value: Boolean) {
        adminMode = value && staff
        preferences.edit().putString("activeAccount", accountId).putBoolean("adminMode", adminMode).apply()
        pendingAdminRoute = null
        if (!adminMode) {
            fun staffLocation(value: String) = operationalCapability(value) != null || (staff && value.substringBefore('/') in setOf("conversation", "draw"))
            visited.filter(::staffLocation).forEach { screenState.removeState(it) }
            tabLocations.entries.removeAll { staffLocation(it.value) }
            tabStacks.clear(); stack.clear()
            if (staffLocation(route)) route = routeTab(route)
        }
    }
    LaunchedEffect(model.requestedRoute) { model.requestedRoute?.let { navigate(it); model.requestedRoute = null } }
    BackHandler(route != "home" || stack.isNotEmpty()) { back() }
    val tabs = listOf("home" to "uxShell.home", "events" to "uxShell.events", "card" to "uxShell.card", "hub" to "uxShell.community", "profile" to "uxShell.account")
    CompositionLocalProvider(LocalAdminMode provides (adminMode && staff)) {
        Column(Modifier.background(MaterialTheme.colorScheme.background)) {
            Row(Modifier.fillMaxWidth().background(tone("band")).padding(horizontal = Space.page, vertical = Space.small), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.gap)) {
                Image(painterResource(R.drawable.official_crest), tr("common.appName"), Modifier.size(40.dp))
                Text(tr("common.appName").uppercase(), Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, color = tone("bandText"))
                LanguageToggle(language, true, setLanguage)
            }
            Box(Modifier.fillMaxWidth().height(3.dp).background(tone("gold")))
            if (adminMode && staff) Row(Modifier.fillMaxWidth().background(tone("band")).padding(horizontal = Space.page), verticalAlignment = Alignment.CenterVertically) {
                Text(scope, Modifier.weight(1f), color = tone("bandText"), style = MaterialTheme.typography.bodySmall)
                TextButton({ setMode(false) }) { Text(tr("uxShell.exitAdmin"), color = tone("bandText")) }
            }
            if (tabs.none { it.first == route }) Row(Modifier.fillMaxWidth().padding(horizontal = Space.page)) { TextButton({ back() }) { Text(tr("common.back")) } }
            Box(Modifier.weight(1f)) {
                screenState.SaveableStateProvider(route) {
                    key(route) { Page(onRefresh = { try { model.api.reload(); model.offline = false } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { model.offline = true; throw e } }) {
                        visited.add(route)
                        if (offline) Notice(tr("errors.network"))
                        val kind = route.substringBefore('/'); val id = route.substringAfter('/', "")
                        val need = operationalCapability(route)
                        val personalOnly = kind in setOf("wallet", "claims", "promoter", "region-change", "roaming", "reservation", "history", "profile-edit", "membership-settings")
                        val denied = (need != null && (!hasCapability(session, need) || !adminMode || !staff)) || (personalOnly && !hasPersonalMembership(session))
                        if (denied) Notice(tr("errors.forbidden"), true) else when (kind) {
                            "home" -> MemberHome(session, model.api, ::navigate)
                            "card" -> MemberCard(session, model.api, ::navigate)
                            "events" -> Events(model.api, ::navigate, language, admin = adminMode, onCreate = if (adminMode && city.isNotBlank()) ({ navigate("event-new") }) else null, session = session)
                            "event" -> EventDetail(model.api, id, language, ::navigate, session = session)
                            "history" -> History(model.api, language)
                            "wallet" -> Wallet(session, model.api, language, ::navigate, initialTab = id)
                            "leaderboard" -> Leaderboard(model.api, language, session.me.obj("member").obj("city").text("id"))
                            "claims", "promoter" -> Claims(session, model.api, initialEventId = id)
                            "draw" -> Draw(session, model.api, id, language)
                            "region-change" -> RegionChange(model.api)
                            "roaming" -> Roaming(session, model.api, id, ::navigate)
                            "reservation" -> Reservation(model.api, id, ::navigate)
                            "hub", "social-hub" -> Hub(session, model.api, { next -> if (next.startsWith("channel/")) selectedHubChannel = next.substringAfter('/'); navigate(next) }, selectedChannel = selectedHubChannel, language = language, allowCapture = BuildConfig.DEBUG && model.qaCapture)
                            "channel", "conversation" -> Channel(session, model.api, id, kind == "conversation", language, BuildConfig.DEBUG && model.qaCapture)
                            "social-operations", "my-reservations" -> SocialOperations(session, model.api, language, ::navigate, mode = "my-reservations")
                            "my-access" -> SocialOperations(session, model.api, language, ::navigate, mode = "my-access")
                            "event-reservations" -> SocialOperations(session, model.api, language, ::navigate, mode = "reservations", eventId = id)
                            "event-roaming" -> SocialOperations(session, model.api, language, ::navigate, mode = "attendance-access", eventId = id)
                            "hub-access" -> SocialOperations(session, model.api, language, ::navigate, mode = "hub-access", cityId = id)
                            "moderation" -> SocialOperations(session, model.api, language, ::navigate, mode = "moderation", cityId = id)
                            "community-tools" -> {
                                Title(tr("uxShell.community")); Action(tr("uxShell.bookings"), secondary = true) { navigate("event-reservations") }
                                Action(tr("uxShell.requests"), secondary = true) { navigate("event-roaming") }
                                Action(tr("uxSocial.moderation"), secondary = true) { navigate("moderation") }
                                if (hasCapability(session, "hq.manage")) Action(tr("uxSocial.hubAccess"), secondary = true) { navigate("hub-access") }
                            }
                            "notifications" -> Notifications(model.api, language, ::navigate, session = session, adminMode = adminMode)
                            "notification-settings" -> NotificationSettings(model.api)
                            "profile" -> Profile(session, model.api, language, setLanguage, ::navigate, adminMode, ::setMode, scope)
                            "profile-edit" -> { Title(tr("uxShell.editProfile")); ProfileEditor(session.me.obj("member"), model.api) }
                            "account-settings" -> {
                                Title(tr("uxShell.settings")); Action(tr("app.notificationSettingsTitle"), secondary = true) { navigate("notification-settings") }
                                Text(tr("common.language")); LanguageToggle(language, setLanguage = setLanguage)
                                if (hasPersonalMembership(session)) Action(tr("uxShell.membership"), secondary = true) { navigate("membership-settings") }
                            }
                            "membership-settings" -> MembershipSettings(session, model.api, ::navigate)
                            "card-help" -> { Title(tr("uxShell.cardHelp")); Notice(tr("uxShell.cardHelpBody")); Action(tr("uxShell.account"), secondary = true) { navigate("profile") } }
                            "tools" -> AdminTools(session, ::navigate)
                            "hq-web" -> {
                                Title(tr("uxShell.dashboard"))
                                Action(tr("uxShell.dashboard"), secondary = true) { activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(model.api.origin.trimEnd('/') + "/overview"))) }
                            }
                            "scan" -> if (id.isEmpty()) Events(model.api, ::navigate, language, admin = true, scan = true, session = session) else Scan(model.api, reader, id, false, ::navigate)
                            "manual" -> Scan(model.api, reader, id, true, ::navigate)
                            "city-events" -> {
                                if (hasCapability(session, "hq.manage")) Action(tr("uxShell.dashboard"), secondary = true) { activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(model.api.origin.trimEnd('/') + "/events"))) }
                                Events(model.api, ::navigate, language, admin = true, onCreate = if (city.isNotBlank()) ({ navigate("event-new") }) else null, session = session)
                            }
                            "city-event" -> AdminEventDetail(session, model.api, id, language, ::navigate)
                            "event-new" -> EventEditor(model.api, "", ::navigate)
                            "event-edit" -> EventEditor(model.api, id, ::navigate)
                            "handover" -> Handover(model.api, reader, ::navigate)
                            "member-cards" -> MemberCards(model.api, ::navigate)
                            "member-card" -> MemberCardDetail(session, model.api, id, language, ::navigate)
                            "encode" -> EncodeHome(model.api, ::navigate)
                            "encode-run" -> EncodeRun(model.api, reader, batchId = id, go = ::navigate)
                            "reencode" -> EncodeRun(model.api, reader, grantId = id.substringBefore('/'), initialLookup = id.substringAfter('/', ""), go = ::navigate)
                            "reward-validation" -> RewardValidation(model.api, initialEventId = id)
                            "claims-review" -> ClaimsReview(model.api, eventId = id)
                            "operations", "crew" -> CrewOperations(model.api, ::navigate)
                            else -> Notice(tr("errors.notFound"), true)
                        }
                    } }
                }
            }
            Row(Modifier.fillMaxWidth().background(tone("band")).selectableGroup()) {
                tabs.forEach { (target, label) ->
                    val selected = routeTab(route) == target
                    Column(Modifier.weight(1f).selectable(selected, role = Role.Tab, onClick = {
                        val previous = routeTab(route); tabLocations[previous] = route; tabStacks[previous] = stack.toList()
                        stack.clear()
                        if (previous == target) { route = target; tabLocations[target] = target }
                        else { stack.addAll(tabStacks[target].orEmpty()); route = tabLocations[target] ?: target }
                    }).padding(bottom = Space.small), horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(Modifier.fillMaxWidth().height(3.dp).background(if (selected) tone("gold") else Color.Transparent))
                        Box(Modifier.padding(top = Space.small, bottom = Space.tiny).size(32.dp).background(if (target == "card") tone("secondary") else Color.Transparent, MaterialTheme.shapes.medium), contentAlignment = Alignment.Center) { PatsIcon(target, tone(if (selected || target == "card") "bandText" else "bandMuted")) }
                        FitTabLabel(tr(label), tone(if (selected) "bandText" else "bandMuted"), Modifier.fillMaxWidth().padding(horizontal = Space.tiny))
                    }
                }
            }
        }
        pendingAdminRoute?.let { target -> Confirm(tr("uxShell.adminEntry"), tr("uxShell.adminEntryBody"), { pendingAdminRoute = null }) { setMode(true); navigate(target) } }
    }
}
