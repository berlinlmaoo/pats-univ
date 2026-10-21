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
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject

@Composable fun Shell(model: AppModel, session: Session, language: String, setLanguage: (String) -> Unit, offline: Boolean) {
    val activity = LocalContext.current as Activity
    val preferences = remember { activity.getSharedPreferences("ux-preferences", 0) }
    val accountId = session.me.obj("user").text("id")
    val staff = isStaff(session)
    var adminMode by rememberSaveable(accountId) { mutableStateOf(staff && preferences.getString("activeAccount", "") == accountId && preferences.getBoolean("adminMode", false)) }
    var route by rememberSaveable(accountId) { mutableStateOf("home") }
    var selectedHubChannel by rememberSaveable(accountId) { mutableStateOf("") }
    var pendingAdminRoute by rememberSaveable(accountId) { mutableStateOf<String?>(null) }
    var pendingNotificationId by rememberSaveable(accountId) { mutableStateOf<String?>(null) }
    var staffTaskBusy by remember(accountId) { mutableStateOf(false) }
    var navigationBlocked by remember(accountId) { mutableStateOf(false) }
    var pinnedEvent by remember(route, adminMode) { mutableStateOf<JsonObject?>(null) }
    val publishPinnedEvent = remember(route, adminMode) { { event: JsonObject -> pinnedEvent = event } }
    val pinEvent = staff && adminMode && route.substringBefore('/') in setOf("city-event", "scan", "manual", "draw", "event-content", "event-reservations", "event-roaming", "claims-review", "reward-validation") && route.substringAfter('/', "").isNotBlank()
    LaunchedEffect(route, pinEvent) {
        if (pinEvent && route.substringBefore('/') in setOf("event-reservations", "event-roaming", "claims-review", "reward-validation")) {
            try { pinnedEvent = model.api.request("GET", "/api/admin/events/" + query(route.substringAfter('/').substringBefore('/'))).obj("event").takeIf { it.isNotEmpty() } }
            catch (e: kotlinx.coroutines.CancellationException) { throw e }
            catch (_: Exception) { /* The scoped screen presents its own request failure. */ }
        }
    }
    val publishStaffBusy = remember(accountId) { { busy: Boolean -> staffTaskBusy = busy } }
    val coroutine = rememberCoroutineScope()
    LaunchedEffect(staffTaskBusy) { if (!staffTaskBusy) navigationBlocked = false }
    val stack = remember(accountId) { mutableStateListOf<String>() }
    val tabLocations = remember(accountId) { mutableStateMapOf<String, String>() }
    val tabStacks = remember(accountId) { mutableStateMapOf<String, List<String>>() }
    val screenState = rememberSaveableStateHolder()
    val visited = remember(accountId) { mutableSetOf<String>() }
    val reader = remember(activity) { AndroidCardReader(activity) }
    val adminScope = session.me.obj("user").obj("adminScope")
    val city = adminScope.obj("city").text("name", session.me.obj("user").obj("city").text("name"))
    val scope = if (adminScope.text("kind") == "HQ") tr("ux.adminMode.scopeHq") else tr("ux.adminMode.scopeCity", "city" to city)
    LaunchedEffect(accountId, staff) {
        if (preferences.getString("activeAccount", "") != accountId || !staff) adminMode = false
        preferences.edit().putString("activeAccount", accountId).putBoolean("adminMode", adminMode).apply()
    }
    fun navigate(next: String) {
        if (staffTaskBusy) { navigationBlocked = true; return }
        val notificationOpen = next.startsWith("admin-open-notification/")
        val notificationRest = next.removePrefix("admin-open-notification/")
        val forceAdmin = next.startsWith("admin-open/") || notificationOpen
        val target = when { notificationOpen -> notificationRest.substringAfter('/'); forceAdmin -> next.removePrefix("admin-open/"); else -> next }
        val need = operationalCapability(target)
        if (forceAdmin && (!staff || (need != null && !hasCapability(session, need)))) return
        if ((forceAdmin || need != null) && staff && (need == null || hasCapability(session, need)) && !adminMode) {
            pendingNotificationId = if (notificationOpen) notificationRest.substringBefore('/') else null
            pendingAdminRoute = target; return
        }
        if (target != route) { stack.add(route); tabLocations[routeTab(route)] = route; route = target }
    }
    fun back() { if (staffTaskBusy) { navigationBlocked = true; return }; route = if (stack.isEmpty()) "home" else stack.removeAt(stack.lastIndex) }
    fun setMode(value: Boolean) {
        if (!value && staffTaskBusy) { navigationBlocked = true; return }
        adminMode = value && staff
        preferences.edit().putString("activeAccount", accountId).putBoolean("adminMode", adminMode).apply()
        pendingAdminRoute = null
        pendingNotificationId = null
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
    CompositionLocalProvider(LocalAdminMode provides (adminMode && staff), LocalStaffTaskBusy provides publishStaffBusy, LocalAdminEventContext provides publishPinnedEvent.takeIf { pinEvent }) {
        Column(Modifier.background(MaterialTheme.colorScheme.background)) {
            Row(Modifier.fillMaxWidth().background(tone("band")).padding(horizontal = Space.page, vertical = Space.small), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.gap)) {
                Image(painterResource(R.drawable.official_crest), tr("common.appName"), Modifier.size(40.dp))
                Text(tr("common.appName").uppercase(), Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, color = tone("bandText"))
                LanguageToggle(language, true, setLanguage)
            }
            Box(Modifier.fillMaxWidth().height(3.dp).background(tone("gold")))
            if (navigationBlocked && staffTaskBusy) Notice(tr("ux.adminMode.finishFirst"))
            if (adminMode && staff) Row(Modifier.fillMaxWidth().background(tone("band")).padding(horizontal = Space.page), verticalAlignment = Alignment.CenterVertically) {
                Text(scope, Modifier.weight(1f), color = tone("bandText"), style = MaterialTheme.typography.bodySmall)
                TextButton({ setMode(false) }) { Text(tr("uxShell.exitAdmin"), color = tone("bandText")) }
            }
            if (tabs.none { it.first == route }) Row(Modifier.fillMaxWidth().padding(horizontal = Space.page)) { TextButton({ back() }) { Text(tr("common.back")) } }
            if (pinEvent) pinnedEvent?.let { PinnedAdminEventContext(it, language) }
            Box(Modifier.weight(1f)) {
                screenState.SaveableStateProvider(route) {
                    key(route) { Page(onRefresh = { try { model.api.reload(); model.offline = false } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { model.offline = true; throw e } }) {
                        visited.add(route)
                        if (offline) Notice(tr("errors.network"))
                        val kind = route.substringBefore('/'); val id = route.substringAfter('/', "")
                        val need = operationalCapability(route)
                        val personalOnly = kind in setOf("wallet", "claims", "promoter", "region-change", "roaming", "reservation", "booking", "history", "profile-edit", "membership-settings")
                        val denied = (need != null && (!hasCapability(session, need) || !adminMode || !staff)) || (personalOnly && !hasPersonalMembership(session))
                        if (denied) Notice(tr("errors.forbidden"), true) else when (kind) {
                            "home" -> MemberHome(session, model.api, ::navigate)
                            "card" -> MemberCard(session, model.api, ::navigate)
                            "events" -> Events(model.api, ::navigate, language, admin = adminMode, onCreate = if (adminMode && city.isNotBlank()) ({ navigate("event-new") }) else null, session = session)
                            "event" -> EventDetail(model.api, id, language, ::navigate, session = session)
                            "history" -> History(model.api, language)
                            "wallet" -> Wallet(session, model.api, language, ::navigate, initialTab = id)
                            "leaderboard" -> Leaderboard(model.api, language, session.me.obj("member").obj("city").text("id"))
                            "claims", "promoter" -> Claims(session, model.api, initialEventId = id.substringBefore('/'), go = ::navigate, initialClaimId = id.substringAfter('/', ""))
                            "draw" -> Draw(session, model.api, id, language)
                            "region-change" -> RegionChange(model.api)
                            "roaming" -> Roaming(session, model.api, id, ::navigate)
                            "reservation" -> Reservation(model.api, id, ::navigate)
                            "hub", "social-hub" -> Hub(session, model.api, { next -> if (next.startsWith("channel/")) selectedHubChannel = next.substringAfter('/'); navigate(next) }, selectedChannel = selectedHubChannel, language = language, allowCapture = BuildConfig.DEBUG && model.qaCapture)
                            "channel", "conversation" -> Channel(session, model.api, id, kind == "conversation", language, BuildConfig.DEBUG && model.qaCapture)
                            "social-operations", "my-reservations" -> SocialOperations(session, model.api, language, ::navigate, mode = "my-reservations")
                            "booking" -> SocialOperations(session, model.api, language, ::navigate, mode = "my-reservations", eventId = if ('/' in id) id.substringBefore('/') else "", reservationId = id.substringAfter('/', id))
                            "my-access" -> SocialOperations(session, model.api, language, ::navigate, mode = "my-access")
                            "event-reservations" -> SocialOperations(session, model.api, language, ::navigate, mode = "reservations", eventId = id)
                            "event-roaming" -> SocialOperations(session, model.api, language, ::navigate, mode = "attendance-access", eventId = id)
                            "access-review" -> SocialAccessReview(session, model.api, id.substringAfter('/', ""), language, ::navigate, eventId = id.substringBefore('/'))
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
                            "event-content" -> EventContent(model.api, id, language, ::navigate)
                            "content-approvals" -> ContentApprovals(session, model.api, language, ::navigate, selectedSubmission = id)
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
                        if (staffTaskBusy) { navigationBlocked = true; return@selectable }
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
        pendingAdminRoute?.let { target -> Confirm(tr("uxShell.adminEntry"), tr("uxShell.adminEntryBody"), { pendingAdminRoute = null; pendingNotificationId = null }) {
            val notificationId = pendingNotificationId
            setMode(true); navigate(target)
            if (!notificationId.isNullOrBlank()) coroutine.launch { runCatching { model.api.request("POST", "/api/me/notifications/${query(notificationId)}/read", body()) } }
        } }
    }
}
