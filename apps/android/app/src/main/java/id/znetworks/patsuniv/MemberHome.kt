package id.znetworks.patsuniv

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.platform.LocalContext
import kotlinx.serialization.json.JsonObject

@Composable fun MemberHome(session: Session, api: Api, go: (String) -> Unit) {
    val member = session.me.obj("member")
    val name = member.text("fullName", session.me.obj("user").text("name")).substringBefore(' ')
    Title(tr("uxShell.currentWork"), tr("app.greeting", "name" to name))
    FirstUseWelcome(session, go)
    if (LocalAdminMode.current && isStaff(session)) { StaffHome(session, api, go); return }
    if (!hasPersonalMembership(session)) {
        Notice(tr("uxShell.staffWelcome"))
        Action(tr("uxShell.account")) { go("profile") }
        Action(tr("uxShell.events"), secondary = true) { go("events") }
        Action(tr("uxShell.notifications"), secondary = true) { go("notifications") }
        return
    }
    var unread by remember(session.me.obj("user").text("id")) { mutableIntStateOf(0) }
    Remote(api, "/api/me/home", pollMs = 15_000) { data, reload ->
        SideEffect { unread = data.number("unreadNotifications") }
        val next = data.obj("next")
        val event = next.obj("event")
        if (event.isEmpty()) {
            Empty(tr("app.eventsEmptyTitle"), tr("ux.home.noEvent", "city" to data.obj("homeCity").text("name", member.obj("city").text("name"))))
            Action(tr("uxShell.events"), secondary = true) { go("events") }
        } else {
            if (next.flag("national")) Notice(tr("uxMember.nationalNextEvent"))
            EventJourney(session, api, event, go, next.rows("journey"), next.obj("myReservation"), reload)
        }
        val blocking = data.obj("blockingReservation")
        if (blocking.isNotEmpty()) Tile {
            Notice(tr("ux.reservation.blocked", "event" to blocking.obj("event").text("title")))
            Text(blocking.text("slotCode"))
            Action(tr("ux.reservation.openBlocking"), secondary = true) { go(if (blocking.text("conversationId").isNotBlank()) "conversation/" + blocking.text("conversationId") else "booking/" + blocking.obj("event").text("id") + "/" + blocking.text("id")) }
        }
        if (data.obj("card").obj("digital").flag("ready")) Badge(tr("ux.card.digitalReady"), "ACTIVE")
    }
    Action(tr("uxShell.card"), maroon = true) { go("card") }
    Remote(api, "/api/loyalty/wallet", refresh = liveVersion(api, "wallet", member.text("id"))) { data, _ ->
        Tile {
            SectionLabel(tr("uxShell.xpRewards"))
            Text(count(data.number("balance")) + " XP", style = MaterialTheme.typography.titleLarge)
            Action(tr("uxShell.xpRewards"), secondary = true) { go("wallet") }
        }
    }
    if (unread > 0) Text(tr("app.notificationsUnread", "count" to count(unread)), style = MaterialTheme.typography.bodySmall)
    Action(tr("uxShell.notifications"), secondary = true) { go("notifications") }
}

@Composable private fun FirstUseWelcome(session: Session, go: (String) -> Unit) {
    val context = LocalContext.current
    val preferences = remember { context.getSharedPreferences("ux-preferences", 0) }
    val key = "welcome-" + session.me.obj("user").text("id")
    var shown by rememberSaveable(key) { mutableStateOf(!preferences.getBoolean(key, false)) }
    if (shown) Tile {
        Text(tr("uxShell.welcome"), style = MaterialTheme.typography.titleLarge)
        Text(tr(if (hasPersonalMembership(session)) "uxShell.welcomeBody" else "uxShell.staffWelcome"))
        if (hasPersonalMembership(session)) {
            Action(tr("uxShell.card"), secondary = true) { go("card") }
            Action(tr("uxShell.events"), secondary = true) { go("events") }
        } else Action(tr("uxShell.account"), secondary = true) { go("profile") }
        Action(tr("uxShell.dismiss"), secondary = true) { shown = false; preferences.edit().putBoolean(key, true).apply() }
    }
}

@Composable private fun StaffHome(session: Session, api: Api, go: (String) -> Unit) {
    SectionLabel(tr("uxShell.todayWork"))
    Remote(api, "/api/admin/home", pollMs = 15_000) { data, _ ->
        val scope = data.obj("scope")
        Text(tr(if (scope.text("kind") == "HQ") "ux.adminMode.scopeHq" else "ux.adminMode.scopeCity", "city" to scope.obj("city").text("name")))
        val openEvents = data.rows("openEvents")
        openEvents.forEach { event -> Tile {
            Text(event.text("title"), style = MaterialTheme.typography.titleLarge)
            Text(event.obj("city").text("name")); Text(dateTime(eventTime(event, "startsAt"), LocalLanguage.current, eventZone(event)))
            Badge(tr("eventPhase." + event.text("phase")), event.text("phase"))
            if (event.text("phase") == "open" && hasCapability(session, "checkin.scan")) Action(tr("app.adminScan")) { go("scan/" + event.text("id")) }
            Action(tr("uxShell.manageEvent"), secondary = true) { go("city-event/" + event.text("id")) }
        } }
        if (openEvents.isEmpty()) {
            Empty(tr("ux.workspace.noOpenEvent"), tr("uxMember.homeNoOpenBody"))
            val next = data.obj("nextEvent")
            if (next.isNotEmpty()) Tile {
                CardHeading(next.text("title"))
                Text(next.obj("city").text("name"))
                Detail(tr("uxMember.checkInOpens"), dateTime(eventTime(next, "checkInOpensAt"), LocalLanguage.current, eventZone(next)))
                Action(tr("uxShell.manageEvent"), secondary = true) { go("city-event/" + next.text("id")) }
            }
        }
        Action(tr("uxShell.events"), secondary = true) { go("events") }
        SectionLabel(tr("uxShell.recentQueues"))
        data.obj("pending").forEach { (key, value) ->
            val queue = value as? JsonObject ?: return@forEach
            val target = queue.obj("target")
            val route = when (key) {
                "hubAccess" -> "hub-access"
                "myContent" -> "city-events"
                "regionChanges" -> "notifications"
                else -> notificationTargetDestination(target, session, true)
            }
            if (route != null) Action(tr("ux.workspace.pending.$key") + " · " + count(queue.number("count")), secondary = true) { go(route) }
        }
    }
    Action(tr("uxShell.staffTools"), secondary = true) { go("tools") }
}
