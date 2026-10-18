package id.znetworks.patsuniv

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier

@Composable fun MemberHome(session: Session, api: Api, go: (String) -> Unit) {
    val member = session.me.obj("member")
    Title(tr("app.greeting", "name" to member.text("fullName").substringBefore(' ')))
    Remote(api, "/api/events") { data, _ ->
        val event = data.rows("upcoming").firstOrNull()
        SectionLabel(tr("native.nextEvent"))
        if(event == null) Empty(tr("app.eventsEmptyTitle"), tr("app.eventsEmptyBody", "city" to member.obj("city").text("name")))
        else Tile {
            if(event.text("flyerUrl").isNotBlank()) NetworkImage(api,event.text("flyerUrl"))
            Text(event.text("title"), style = MaterialTheme.typography.titleLarge)
            Text(dateTime(event.text("startsAt"), LocalLanguage.current, event.obj("city").text("timezone", "Asia/Jakarta")))
            Text(event.obj("venue").text("name"))
            Badge(tr("eventPhase." + event.text("phase")), event.text("phase"))
            if(event.obj("myCheckIn").isNotEmpty()) Badge(tr("app.resultCheckedIn"), "OPEN")
            Action(tr("common.continue"), secondary = true) { go("event/"+event.text("id")) }
        }
    }
    Remote(api, "/api/loyalty/wallet", refresh = liveVersion(api,"wallet",member.text("id"))) { data, _ ->
        Tile {
            SectionLabel(tr("loyalty.balance"))
            Text(count(data.number("balance")) + " XP", style = MaterialTheme.typography.headlineLarge)
            val milestone = data.obj("milestone")
            if(milestone.isNotEmpty()) {
                Text(if(milestone.number("remaining") > 0) tr("loyalty.milestone", "remaining" to count(milestone.number("remaining")), "reward" to milestone.obj("reward").text("name")) else tr("loyalty.ready"))
                LinearProgressIndicator(progress = { (milestone["progress"] as? kotlinx.serialization.json.JsonPrimitive)?.content?.toFloatOrNull()?.coerceIn(0f,1f) ?: 0f }, modifier = Modifier.fillMaxWidth(), color = tone("gold"), trackColor = tone("surfaceMuted"))
            }
            Action(tr("app.tabRewards"), secondary = true) { go("wallet") }
        }
    }
    Action(tr("app.cardLinkOpen"), maroon = true) { go("card") }
    Action(tr("app.notificationsTitle"), secondary = true) { go("notifications") }
}
