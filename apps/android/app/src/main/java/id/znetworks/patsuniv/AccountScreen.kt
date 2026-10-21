package id.znetworks.patsuniv

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import kotlinx.coroutines.launch

@Composable fun Profile(session: Session, api: Api, language: String, setLanguage: (String) -> Unit, go: (String) -> Unit = {}, adminMode: Boolean = false, setAdminMode: (Boolean) -> Unit = {}, scopeLabel: String = "") {
    val user = session.me.obj("user"); val member = session.me.obj("member")
    var confirm by remember { mutableStateOf(false) }
    val coroutine = rememberCoroutineScope()
    Title(tr("uxShell.account"), member.text("fullName", user.text("name")))
    if (isStaff(session)) Tile {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) { Text(tr("uxShell.adminMode"), style = MaterialTheme.typography.titleMedium); Text(scopeLabel, style = MaterialTheme.typography.bodySmall) }
            Switch(adminMode, setAdminMode)
        }
        if (adminMode) Action(tr("uxShell.staffTools"), secondary = true) { go("tools") }
    }
    SectionLabel(tr("uxShell.identity"))
    Tile {
        if (member.text("nim").isNotBlank()) Text(member.text("nim"))
        Text(user.text("email")); if (user.text("phone").isNotBlank()) Text(user.text("phone"))
        val city = member.obj("city").text("name", user.obj("city").text("name")); if (city.isNotBlank()) Text(city)
        if (hasPersonalMembership(session)) Action(tr("uxShell.editProfile"), secondary = true) { go("profile-edit") }
        else Notice(tr("uxShell.noMembership"))
    }
    if (hasPersonalMembership(session)) {
        SectionLabel(tr("uxShell.activity"))
        Action(tr("uxShell.attendance"), secondary = true) { go("history") }
        Action(tr("uxShell.myClaims"), secondary = true) { go("claims/history") }
        Action(tr("uxShell.bookings"), secondary = true) { go("my-reservations") }
        Action(tr("uxShell.requests"), secondary = true) { go("my-access") }
        Action(tr("uxShell.xpRewards"), secondary = true) { go("wallet") }
    }
    SectionLabel(tr("uxShell.settings"))
    Action(tr("uxShell.notifications"), secondary = true) { go("notifications") }
    Action(tr("uxShell.settings"), secondary = true) { go("account-settings") }
    Action(tr("uxShell.cardHelp"), secondary = true) { go("card-help") }
    Action(tr("common.signOut"), secondary = true) { confirm = true }
    if (confirm) Confirm(tr("common.signOut"), tr("app.signOutBody"), { confirm = false }) { confirm = false; coroutine.launch { api.signOut() } }
    Text(tr("app.version", "version" to BuildConfig.VERSION_NAME), style = MaterialTheme.typography.bodySmall)
}

@Composable fun MembershipSettings(session: Session, api: Api, go: (String) -> Unit) {
    Title(tr("uxShell.membership"))
    if (!hasPersonalMembership(session)) { Notice(tr("uxShell.noMembershipBody")); return }
    Action(tr("phase5.regionChange"), secondary = true) { go("region-change") }
    Notice(tr("uxShell.leaveBody"))
    val mutation = rememberMutation(); MutationStatus(mutation)
    Decide(tr("phase5.leave"), tr("phase5.leaveConfirm"), !mutation.busy, true) { mutation.run { api.request("POST", "/api/me/leave"); api.signOut() } }
}
