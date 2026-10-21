package id.znetworks.patsuniv

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.platform.LocalContext

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
        return
    }
    Remote(api, "/api/events", pollMs = 15_000) { data, _ ->
        val events = data.rows("upcoming")
        val event = events.firstOrNull { it.text("phase") == "open" } ?: events.firstOrNull()
        if (event == null) {
            Empty(tr("app.eventsEmptyTitle"), tr("app.eventsEmptyBody", "city" to member.obj("city").text("name")))
            Action(tr("uxShell.events"), secondary = true) { go("events") }
        } else EventJourney(session, api, event, go)
    }
    Action(tr("uxShell.card"), maroon = true) { go("card") }
    Remote(api, "/api/loyalty/wallet", refresh = liveVersion(api, "wallet", member.text("id"))) { data, _ ->
        Tile {
            SectionLabel(tr("uxShell.xpRewards"))
            Text(count(data.number("balance")) + " XP", style = MaterialTheme.typography.titleLarge)
            Action(tr("uxShell.xpRewards"), secondary = true) { go("wallet") }
        }
    }
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
    Remote(api, "/api/admin/events", pollMs = 30_000) { data, _ ->
        val events = data.rows("upcoming") + data.rows("past")
        var selectedCity by rememberSaveable(session.me.obj("user").text("id")) { mutableStateOf(session.me.obj("user").obj("city").text("id")) }
        if (hasCapability(session, "hq.manage")) {
            val cities = events.map { it.obj("city") }.distinctBy { it.text("id") }
            Choices(tr("uxShell.scope"), cities.map { it.text("id") to it.text("name") }, selectedCity) { selectedCity = it }
            if (selectedCity.isBlank()) Notice(tr("uxShell.chooseCity"))
        }
        val scoped = events.filter { it.obj("city").text("id") == selectedCity }
        val event = scoped.firstOrNull { it.text("phase") == "open" } ?: scoped.firstOrNull { it.text("phase") != "ended" }
        if (event != null) Tile {
            Text(event.text("title"), style = MaterialTheme.typography.titleLarge)
            Text(event.obj("city").text("name")); Text(dateTime(event.text("startsAt"), LocalLanguage.current, event.obj("city").text("timezone", "Asia/Jakarta")))
            Badge(tr("eventPhase." + event.text("phase")), event.text("phase"))
            if (event.text("phase") == "open") Action(tr("app.adminScan")) { go("scan/" + event.text("id")) }
            Action(tr("uxShell.manageEvent"), secondary = true) { go("city-event/" + event.text("id")) }
        } else if (selectedCity.isNotBlank()) Empty(tr("uxShell.noStaffEvent"), tr("uxShell.noStaffEventBody"))
        Action(tr("uxShell.events"), secondary = true) { go("events") }
    }
    if (hasCapability(session, "promoter.manage")) Remote(api, "/api/admin/loyalty/claims", pollMs = 30_000) { data, _ ->
        Action(tr("uxShell.pendingClaims", "count" to count(data.rows("claims").count { it.text("status") == "PENDING" })), secondary = true) { go("claims-review") }
    }
    Remote(api, "/api/social/operations", pollMs = 30_000) { data, _ ->
        SectionLabel(tr("uxShell.recentQueues"))
        if (hasCapability(session, "hq.manage")) Notice(tr("uxShell.queuesAllCities"))
        Action(tr("uxShell.pendingBookings", "count" to count(data.rows("reservations").count { it.text("status") == "PENDING" })), secondary = true) { go("event-reservations") }
        Action(tr("uxShell.pendingAttendance", "count" to count(data.rows("roaming").count { it.text("status") == "PENDING" && it.text("type") == "ATTENDANCE" })), secondary = true) { go("event-roaming") }
        if (hasCapability(session, "hq.manage")) Action(tr("uxShell.pendingHub", "count" to count(data.rows("roaming").count { it.text("status") == "PENDING" && it.text("type") == "SOCIAL_HUB" })), secondary = true) { go("hub-access") }
    }
    Action(tr("uxShell.staffTools"), secondary = true) { go("tools") }
}
