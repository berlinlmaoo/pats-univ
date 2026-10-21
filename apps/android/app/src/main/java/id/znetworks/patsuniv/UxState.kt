package id.znetworks.patsuniv

import androidx.compose.runtime.staticCompositionLocalOf

val LocalAdminMode = staticCompositionLocalOf { false }

fun hasPersonalMembership(session: Session): Boolean =
    session.me.obj("member").isNotEmpty() && session.me.obj("user").text("role") == "MEMBER"

fun isStaff(session: Session): Boolean = hasCapability(session, "city.operations")

fun routeTab(route: String): String = when (route.substringBefore('/')) {
    "home", "wallet", "leaderboard" -> "home"
    "events", "event", "reservation", "draw", "roaming", "city-events", "city-event", "event-new", "event-edit", "scan", "manual", "event-reservations", "event-roaming", "social-operations", "my-reservations", "booking" -> "events"
    "card" -> "card"
    "hub", "social-hub", "channel", "moderation", "hub-access", "community-tools" -> "hub"
    "conversation" -> "events"
    else -> "profile"
}

fun operationalCapability(route: String): String? = when (route.substringBefore('/')) {
    "scan", "manual", "city-events", "city-event", "event-new", "event-edit" -> "checkin.scan"
    "handover" -> "card.handover"
    "member-cards", "member-card" -> "card.reportLost"
    "encode", "encode-run" -> "card.encode"
    "reencode" -> "card.requestReencode"
    "reward-validation" -> "reward.validate"
    "claims-review" -> "promoter.manage"
    "tools", "operations", "crew", "event-reservations", "event-roaming", "moderation", "community-tools" -> "city.operations"
    "hub-access" -> "hq.manage"
    "hq-web" -> "hq.manage"
    else -> null
}
