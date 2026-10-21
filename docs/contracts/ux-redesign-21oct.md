# UX redesign 21 Oct 2026: server contract for the native apps

Owner-approved spec: D1–D9 plus every audit finding (Android UX01–UX30, iOS F01–F35). This file is
the server/web side the iOS and Android sessions build against. Everything is **additive**: no
existing field, route, status code or error code changed meaning for builds already installed,
except the two rules marked **Behaviour change** below (both owner decisions).

- Base URL: the dev origin in the apps' dev config. All paths below are relative to it.
- Auth: unchanged (email + OTP; `Authorization: Bearer <accessToken>`). The quote-as-password idea is on hold.
- Errors: unchanged envelope `{ "error": { "code", "message", "fields"? , "retryAfter"? }, "params"? }`.
  New *field* keys and *params* only; no new `code` values.
- Strings: every new label is in `packages/shared/src/i18n/{en,id}.ts` under `ux.*` (table at the end).
  Native dictionaries copy the keys they use; keys are stable.
- Dates are ISO 8601 UTC; show them in `timing.timezone` / the city's zone (unchanged rule).

## 0. Behaviour changes (owner decisions)

| Change | Who sees it | Old builds |
|---|---|---|
| A **regional admin's** event description no longer goes live directly. `POST /api/admin/events` and `PATCH /api/admin/events/:id` keep the live description and file the new text as a pending submission for HQ (§6). HQ is unchanged. | Regional admin | Save still succeeds (same response shape); the returned `event.description` is the approved one. |
| `GET /api/events?scope=all` now returns **active cities only** (D5 National toggle). | Members | Same shape, fewer rows if a city is inactive. |

Also relaxed (no client breaks): a deposit can be recorded on a `PENDING` reservation (was `CONFIRMED`
only); a staff account **with** its own member profile may use member endpoints (personal
participation follows membership, F03/UX01).

## 1. Finding → server support

| Spec / finding | Server support | Section |
|---|---|---|
| D1, D8, UX01, UX02, F01, F04, F34 | `GET /api/me` → `user.adminScope`, `user.membership`. Admin mode and its persistence stay client-side (per account + device; clear on sign-out/account change). Capabilities stay authoritative. | §2 |
| D2 | Tab names `ux.nav.*` (Beranda · Event · Kartu · Komunitas · Akun) | §12 |
| D3, UX10, UX11, UX12, F07, F08 | `GET /api/me/card` (digital readiness vs physical stage) | §3 |
| D4, UX04, F06 | `GET /api/me/home`, `POST /api/me/journey` | §4 |
| D5, UX05, UX06, UX08, UX09, F09, F10, F12, F19 | `/api/events` scope, `timing`, `actions`, `poster`, `isHomeCity`; detail `journey`, `myReservation` | §5 |
| D5 posters / descriptions | `/api/admin/events/:id/content`, HQ queue `/api/admin/content-submissions` | §6 |
| D5 Reservation cards, UX15, UX17, UX18, UX19, F26, F27, UX29 | reservation cards (poster highlight, slot kind, deposit), `POST /api/admin/reservations/:id/payment`, `RESERVATION_LIMIT` params, `counts` | §7 |
| D6, UX23–UX26, F14–F18, F20, F21, F25 | `GET /api/admin/home`, `GET /api/admin/events/:id/workspace`, `GET /api/admin/events/:id/reservations` | §8 |
| D6 FDC sold | `recap.fdcSold = { value: null, status: "definitionPending" }`; never derived | §8 |
| D7, UX03, F02, F05 | OTP response `destination`, `channel`, `ttlSeconds`; web registration success copy | §9 |
| D9 UX30 | `GET /api/admin/draw?eventId=` (staff, `draw.manage` + city). `GET /api/events/:id` stays member-only. | §8.4 |
| D9 UX22, F32 | `target` on every notification; `POST /api/me/notifications/:id/read`; list GET never marks read | §10 |
| F03 | `membership: "staffOnly"`; member endpoints → 403 `params.reason = "NO_MEMBERSHIP"` | §2 |
| F11, UX07 | `GET /api/social/roaming-options?eventId=`; `originEventId` on `POST /api/social/roaming` | §11 |
| F22, F23, UX14 | claim queue `rules`, `glAllowed`, `editableFields`, `?status=&eventId=`; field error `ux.claims.glNotAllowed` | §11 |
| F24 | Strings `ux.archive.prReports*` (old PR reports = archive, read only) | §12 |
| UX27, F26, F29 | `CardInfo.replacementFee { amount, paidAt }` on crew card screens; record via existing `POST /api/admin/payments { kind: "card", id }` | §11 |
| F30, F31 | Already served: `ReencodeRequestInfo` has `requestedBy`, `grantExpiresAt`, `usedAt`, `mine`; station claim has `mode` and batch. No change. | — |
| UX20, UX21, UX24 copy, UX28, F13, F15, F17, F28, F33, F35 | Client-only (layout, routing, labels, camera/NFC states). Strings provided where useful. | §12 |
| New KTM (21 Oct) | NAME / FAVORITE DRINK / **QOTD** (member quote). `GET /api/me/card` → `face.quote`; public card adds `member.quote`; print template `ktm-2026-qotd`; artwork in `apps/web/public/ktm/*.webp` | §3, §13 |

## 2. `GET /api/me` (additive)

```jsonc
{
  "user": {
    "id": "…", "email": "…", "phone": "…", "name": "…",
    "role": "LOCAL_ADMIN",            // legacy wire role, unchanged
    "locale": "id", "city": { "id": "…", "code": "JKT", "name": "Jakarta" } | null,
    "capabilities": ["checkin.scan", "…"],
    "adminScope": { "kind": "CITY", "city": { "id": "…", "code": "JKT", "name": "Jakarta" } }
               // or { "kind": "HQ", "city": null }; null for members (no Admin mode switch)
    "membership": "member" | "staffOnly"
  },
  "member": { …unchanged… } | null
}
```

- Show the Admin mode switch only when `adminScope != null`. Indicator: `ux.adminMode.on` with
  `ux.adminMode.scopeCity {city}` or `ux.adminMode.scopeHq`.
- `membership = "staffOnly"`: no NIM/card/XP. Card tab shows `ux.staff.noMembershipTitle/Body`. Do not call
  member endpoints; if one is called it answers `403 { error.code: "FORBIDDEN", params: { reason: "NO_MEMBERSHIP" } }`.
- A staff account that also has a member profile gets `membership: "member"` and may use member endpoints.

## 3. Card tab: `GET /api/me/card` (D3)

```jsonc
{
  "digital": { "ready": true, "reason": null },          // reason: "memberInactive" | "noMembership"
  "physical": {
    "status": "ENCODED",                                    // raw CardStatus (unchanged enum)
    "stage": "encoded",       // queued | printing | atHq | encoded | shipped | delivered | inactive
    "batchLabel": "JKT-3" | null,
    "shippedToCityAt": "…" | null,  "deliveredAt": "…" | null,
    "replacementFee": { "amount": 100000, "paidAt": null } | null
  } | null,                                                  // null only for staffOnly
  "face": { "name": "Rara Anindya", "favoriteDrink": "Old fashioned", "quote": "Dance like nobody’s filming." } | null
}
```

- Digital QR readiness never depends on the physical card. Primary action `ux.card.showQr`; caption
  `ux.card.showToCrew`; freshness `ux.card.qrRefresh {seconds}` (QR itself: unchanged `GET /api/me/card-token`).
- `stage` → `ux.card.stage.<stage>` (`shipped` takes `{city}`). `encoded` ≠ in transit: shipped only once HQ ships the batch.
- KTM face: third line is **QOTD** = `face.quote` (also `member.quotes` in `/api/me`). Labels are printed in the artwork; the
  values are upper-case card font. QOTD may wrap to two full-size lines; shrink only if it does not fit
  (`tokens.ts ktm.quoteY`, `ktm.quoteMaxLines = 2`; `genreY` kept as a deprecated alias).

## 4. Home task flow (D4)

### `GET /api/me/home`

```jsonc
{
  "membership": "member",                    // "staffOnly" → next/card/blockingReservation are null
  "homeCity": { "id": "…", "code": "JKT", "name": "Jakarta" },
  "next": {                                  // null: nothing upcoming anywhere
    "national": false,                       // true: nothing in the home city; this event is elsewhere
    "event": EventSummary,                   // member summary (§5)
    "journey": JourneyStep[],                // §4.1
    "myReservation": MyReservation | null    // §5.2
  },
  "card": CardStateResponse,                 // §3
  "blockingReservation": { "id", "status", "slotCode", "event": { "id", "title" }, "conversationId" } | null,
  "unreadNotifications": 3,
  "serverTime": "…"
}
```

Each section loads independently on the server; a missing event never hides card/notifications (F06).

### 4.1 Journey steps

`JourneyStep = { key, state, completion, completedAt, outcome?, bonusXp?, pending? }`

| key | completion | done when | label |
|---|---|---|---|
| `event` | `tap` | member tapped | `ux.journey.event` |
| `poster` | `tap` | member tapped | `ux.journey.poster`; has `pending: "ownerDecision"` → show `ux.journey.posterPending`. **What "blast poster" asks is not decided**; the tap is only recorded (no XP, no share tracking). |
| `reservation` | `tap` | reservation CONFIRMED (`outcome: "reserved"`) or tapped "not this time" (`outcome: "skipped"`). PENDING → `outcome: "requested"`, still current. `bonusXp` = setting `reservationBonusXp` (shown as `ux.journey.reservationBonus {xp}`; awarded at check-in, unchanged rule). | `ux.journey.reservation` |
| `checkIn` | `server` | crew recorded the check-in | `ux.journey.checkIn` |
| `completed` | `server` | checked in **and** the event ended | `ux.journey.completed` |

`state`: `done` | `current` (first not done) | `upcoming`.

### `POST /api/me/journey`

Body `{ "eventId": "…", "step": "event" | "poster" | "reservation" }` → 200 with the event detail (§5.2,
including the refreshed `journey`). Idempotent (first tap time kept). `checkIn`/`completed` → 422
`fields.step = "validation.invalid"`. Unknown/draft event → 404.

## 5. Events (D5)

### 5.1 `GET /api/events?scope=city|national`

- Default `city` = member's home city. `national` (legacy alias `all`) = every **active** city.
- Response adds `scope` and `homeCity`. Split stays `upcoming` / `past`.
- Toggle label `ux.events.national`; captions `ux.events.nationalOn` / `ux.events.nationalOff {city}`.
- Rename "Reserve a slot" → `ux.events.reservation` (Reservation / Reservasi).

`EventSummary` additions (member and staff lists unless noted):

```jsonc
{
  …existing fields (flyerUrl kept)…,
  "timing": {
    "timezone": "Asia/Jakarta",
    "startsAt": "…", "endsAt": "…", "checkInOpensAt": "…", "checkInClosesAt": "…",
    "overnight": true,                 // ends on a later calendar day (city zone): keep dates on both ends
    "opensBeforeMinutes": 60,
    "next": { "kind": "checkInOpens", "at": "…" } | null   // checkInOpens | starts | checkInCloses | ends
  },
  "poster": { "url": "/api/events/<id>/flyer?v=…" | null, "description": "approved text" },
  "isHomeCity": true,                                       // member endpoints only
  "actions": [                                              // member endpoints only
    { "key": "reserve",  "available": true,  "reason": null },
    { "key": "showQr",   "available": false, "reason": "checkInNotOpen" },
    { "key": "roaming",  "available": false, "reason": "homeCity" },
    { "key": "claimXp",  "available": false, "reason": "eventNotEnded" },
    { "key": "draw",     "available": false, "reason": "drawNotConfigured" }
  ]
}
```

Reasons → `ux.reason.<reason>`: `eventEnded`, `eventNotEnded`, `noVenue`, `reservationExists`,
`noCityAccess`, `checkInNotOpen`, `alreadyCheckedIn`, `roamingRequired`, `homeCity`, `claimSubmitted`,
`drawNotConfigured`. Rules: QR only while check-in is open and the member may attend (home city or
approved attendance roaming); roaming only for other-city, not-ended events; Claim XP only after the
end (home city or checked in) and once. Timing labels: `ux.timing.*`.

### 5.2 `GET /api/events/:id` (member)

```jsonc
{
  "event": EventSummary,
  "journey": JourneyStep[],
  "myReservation": {
    "id": "…", "status": "PENDING" | "CONFIRMED", "slotCode": "S1", "pax": 2, "conversationId": "…" | null,
    "payment": ReservationPayment                           // §7
  } | null
}
```

After a QR is shown, refetch this (or listen to the existing attendance realtime) to show
`myCheckIn` — the server never reports success from a displayed QR (F12).

## 6. Poster & description approval (D5)

Members only ever see the **approved** poster/description (`event.poster`, `event.description`,
`flyerUrl`). HQ edits apply at once; a regional admin's edits wait for HQ. One waiting submission
per event: a newer one replaces (withdraws) the older.

### `GET /api/admin/events/:id/content` (staff of the city, HQ)

```jsonc
{
  "live": { "url": "/api/events/<id>/flyer?v=…" | null, "description": "…" },
  "mode": "direct" | "approval",               // HQ → direct, regional → approval
  "pending": ContentSubmission | null,
  "history": ContentSubmission[]                // last 20 decided/withdrawn
}
ContentSubmission = {
  "id", "eventId", "eventTitle", "city": { "id", "name" },
  "status": "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN",
  "description": "…" | null,                   // null = description unchanged
  "posterUrl": "/api/admin/content-submissions/<id>/poster" | null,   // staff-only preview (bearer)
  "submittedBy", "submittedAt", "decidedBy", "decidedAt", "note"
}
```

### `POST /api/admin/events/:id/content`

`multipart/form-data` with `description` (≤ 2000 chars) and/or `poster` (JPG/PNG/WebP ≤ 5 MB),
or JSON `{ "description": "…" }`. → `{ "mode": "direct" | "approval", "submission": ContentSubmission }`.

| Error | When |
|---|---|
| 422 `fields.description = "ux.content.noChange"` | neither poster nor a changed description |
| 422 `fields.poster = "validation.flyerType" / "validation.flyerTooLarge" / "validation.flyerRequired"` | bad file |
| 422 `fields.description = "validation.tooLong"` | > 2000 chars |
| 403 / 404 | other city / unknown event |

Copy: `ux.content.approvalHint` (regional), `ux.content.directHint` (HQ), success `ux.content.submitted` /
`ux.content.saved`, waiting badge `ux.content.pending`, `ux.content.replacesPending`.

### HQ queue

- `GET /api/admin/content-submissions?status=PENDING|APPROVED|REJECTED|WITHDRAWN|ALL` (HQ) →
  `{ "submissions": ContentSubmission[] }` (PENDING oldest first).
- `POST /api/admin/content-submissions/:id/decision` (HQ) `{ "decision": "APPROVED" | "REJECTED", "note": "…" }`
  → `{ "submission": ContentSubmission }`. Reject needs `note` ≥ 3 chars (422 `fields.note = "validation.required"`).
  Decided twice → 409 `REQUEST_DECIDED`. Regional → 403.
- Pushes: HQ gets `contentSubmitted` (target `adminContentQueue`); the submitter gets `contentDecided`
  (target `adminEventContent`). Web dashboard: event page "Poster & description" panel; HQ tab
  `/regional?tab=posters`.

## 7. Reservations (D5, UX18, UX19, F26)

`ReservationPayment = { "paid": bool, "amount": int | null, "paidAt": "…" | null, "recordedBy": "name" | null, "blocksNewBookings": bool }`
(`blocksNewBookings` = unpaid and PENDING/CONFIRMED). Payment is off-app (`ux.reservation.depositOffApp`).

Reservation **card** (member and admin): status, slot and kind, pax, minimum charge, conversation,
deposit and the **event poster highlight**; tap → full poster + description (`ux.reservation.posterHint`).

- `GET /api/social/operations[?eventId=]` (existing) — each `reservations[]` row adds
  `slotKind` (`TABLE|SOFA|OTHER`, label `ux.reservation.kind.*`), `venueName`, `payment`,
  `poster { url, description }`, `canRecordDeposit`; `event` adds `description`, `startsAt`. Response adds
  `counts { reservationsPending, depositsUnpaid, roamingPending }` for queue badges. `?eventId=` filters
  reservations and roaming to one event.
- `GET /api/social/slots?eventId=` (existing) adds `poster { url, description }` and `venueMinimumCharge`.
- `POST /api/social/reserve` (existing): when an unpaid booking blocks the new one →
  `409 RESERVATION_LIMIT` with `params { reservationId, eventId, event, conversationId }`
  → `ux.reservation.blocked {event}` + `ux.reservation.openBlocking`.
- Review before sending: `ux.reservation.review`, button `ux.reservation.send`; after sending show
  `ux.reservation.pendingTitle` above the crew chat. Cancel confirm `ux.reservation.cancelConfirm {slot} {event}`.

### `POST /api/admin/reservations/:id/payment` (crew with `reservation.manage`, city)

Body `{ "amount": 150000 }` (int rupiah ≥ 1). Allowed while PENDING or CONFIRMED, once.
→ `{ "reservation": ReservationCard }` (same card as `GET /api/admin/events/:id/reservations`).
Errors: 409 `REQUEST_DECIDED` (already recorded), 422 (rejected/cancelled booking), 403 other city.
Confirm copy `ux.reservation.depositConfirm {amount} {member}`. Legacy `POST /api/admin/payments
{ kind: "reservation", id, amount }` keeps working (same rule).

`ReservationCard` (admin event list and payment response):

```jsonc
{
  "id", "status", "slotCode", "slotKind": "SOFA", "pax", "minimumCharge", "note", "createdAt", "updatedAt",
  "conversationId", "member": { "id", "fullName", "nim" }, "venue": { "id", "name" },
  "event": { "id", "title", "city": { "id", "name", "timezone" }, "startsAt", "endsAt",
             "poster": { "url", "description" } },
  "payment": ReservationPayment
}
```

## 8. Staff (Admin mode)

### 8.1 `GET /api/admin/home`

```jsonc
{
  "scope": AdminScope,
  "serverTime": "…",
  "openEvents": EventSummary[],         // check-in open now → scan picker ("Choose event to scan")
  "nextEvent": EventSummary | null,     // when none is open: show ux.workspace.noOpenEvent + nextOpens {event} {time=timing.checkInOpensAt}
  "pending": {
    "claims":       { "count": 0, "target": NotificationTarget },
    "reservations": { … }, "deposits": { … }, "roaming": { … }, "recapsDue": { … },
    // HQ only:
    "hubAccess": { … }, "reencode": { … }, "regionChanges": { … }, "content": { … },
    // regional only:
    "myContent": { … }
  }
}
```

Labels `ux.workspace.pending.<key>`. `target` uses the vocabulary of §10. Show "No events yet"
only when the event list is really empty (UX24).

### 8.2 `GET /api/admin/events/:id/workspace`

```jsonc
{
  "event": EventSummary,                  // with checkInCount, timing, poster
  "lifecycle": {
    "phase": "upcoming",
    "canPublish": false, "canOpen": true, "openEarly": true, "canClose": false,
    "canScan": false,
    "scanUnavailable": "checkInNotOpen" | "checkInEnded" | null,
    "checkInOpensAt": "…", "checkInClosesAt": "…"
  },
  "attendance": { "count": 12, "byMethod": { "NFC": 3, "APP_QR": 8, "MANUAL": 1 }, "capacity": null },
  "reservations": {
    "byStatus": { "PENDING": 0, "CONFIRMED": 4, "REJECTED": 0, "CANCELLED": 1 },
    "unpaidDeposits": 1,
    "sold": { "table": 1, "sofa": 3, "other": 0, "total": 4, "pax": 17 }
  },
  "claims": { "byStatus": { "PENDING": 2, "APPROVED": 5, "REJECTED": 0 } },
  "roaming": { "pending": 0 },
  "rewards": { "fulfilled": 6 },
  "draw": DrawState,                      // same shape as GET /api/loyalty/draw
  "recap": {
    "saved": { …TrafficRecap fields…, "lockedAt": "…" | null } | null,
    "reservationsSold": { "table": 1, "sofa": 3, "other": 0, "total": 4, "pax": 17 },
    "fdcSold": { "value": null, "status": "definitionPending" },
    "due": true, "canLock": false
  },
  "content": EventContentResponse        // §6
}
```

- Tabs: `ux.workspace.overview|attendance|reservations|claims|draw|rewards|recap`.
- Offer only lifecycle controls that apply: ended → `ux.workspace.checkInEnded {time}` instead of Scan (UX25);
  `openEarly` → confirm `ux.workspace.openEarlyBody {time}` (F18). Transitions: existing
  `POST /api/admin/events/:id/actions`.
- **Reservations sold** = confirmed reservations by the venue floor-plan slot kind (system count).
  Labels `ux.recap.sold|soldTable|soldSofa|soldHint`.
- **FDC sold**: `value` is always `null` with `status: "definitionPending"` until the owner defines FDC —
  show `ux.recap.fdcSold` + `ux.recap.fdcPending`. Do not compute it from anything (the manual recap
  `fdcCount` is a separate, existing field).
- `GET /api/admin/loyalty/operations` (existing) adds per event `reservationsSold` and `fdcSold` (same shapes).

### 8.3 `GET /api/admin/events/:id/reservations[?status=PENDING|CONFIRMED|REJECTED|CANCELLED]`

→ `{ "reservations": ReservationCard[], "sold": ReservationsSold }`.

### 8.4 Draw (UX30): `GET /api/admin/draw?eventId=`

Crew with `draw.manage` + city access. → `{ "event": EventSummary, "draw": DrawState, "canRun": bool, "canConfigure": bool }`.
Use this for the staff Draw screen; never call the member-only `GET /api/events/:id` from staff
mode (still 403 for staff without membership). `POST /api/admin/draw` unchanged. Copy `ux.draw.*`.

## 9. Welcome + OTP (D7)

`POST /api/auth/otp/request` adds `destination` (masked, e.g. `ra***@gmail.com`), `channel: "email"`,
`ttlSeconds` (300). Existing `expiresAt`, `resendAfter`, `demoCode` unchanged. Screen copy:
`ux.otp.signInTitle/Body`, `ux.otp.sentTo {email}` (use the typed email), `ux.otp.validFor {minutes}`,
`ux.otp.checkSpam`, `ux.otp.changeEmail`, `ux.otp.resent {email}`, `ux.otp.notMember`.
First-use welcome (dismissible, per account): `ux.welcome.*` (`physicalCard` takes `{city}`).
Web `/join` success now says to return to the app and sign in with the same email.

## 10. Notifications (D9, UX22, F32)

- `GET /api/me/notifications` never marks anything read. Each item adds:

```jsonc
"target": {
  "screen": "event" | "attendance" | "card" | "reservation" | "conversation" | "hub" | "roaming" | "claims"
          | "adminReservations" | "adminRoaming" | "adminClaims" | "adminMemberCard"
          | "adminEventContent" | "adminContentQueue" | "adminEvent" | "notifications",
  "eventId"?, "reservationId"?, "conversationId"?, "channelId"?, "claimId"?, "memberId"?, "requestId"?, "submissionId"?,
  "requiresAdminMode": true,            // staff work: if Admin mode is off, offer ux.adminMode.openIn
  "actionKey": "ux.notifAction.reviewBooking"
}
```

- `POST /api/me/notifications/:id/read` → `{ "id", "readAt", "unread" }` (when its content is opened; idempotent).
- Explicit "Mark all read" (`ux.notif.markAllRead`): existing `POST /api/me/notifications/read { "all": true }`
  (or `{ "ids": [...] }`).
- New stored payloads also carry ids: reservations (`eventId`, `reservationId`, `conversationId`),
  roaming (`eventId`, `requestId`), claims (`claimId`, `eventId`). Push `data` carries the same keys plus
  `notificationId` and `kind`; derive the target with the same rules (old rows map via `data.screen`).
- New kinds: `contentSubmitted`, `contentDecided` (category account).

## 11. Other alignments

- **Roaming (F11, UX07)**: `GET /api/social/roaming-options?eventId=` →
  `{ event: { id, title, city, endsAt }, homeCityId, hubAccessHours, options: [{ type: "ATTENDANCE" | "SOCIAL_HUB", available, reason: "homeCity" | "eventEnded" | "requestExists" | "monthlyLimit" | null, approver: "REGIONAL_ADMIN" | "HQ", existing: { id, status, accessExpiresAt } | null }] }`.
  `POST /api/social/roaming` accepts `originEventId`; if sent and ≠ `eventId` → 422 `fields.eventId = "ux.roaming.eventChanged"`.
  Home-city event → 422 `fields.eventId = "ux.roaming.homeCityError"`. Never preselect another event.
- **Claims (F22, F23)**: `GET /api/admin/loyalty/claims[?status=&eventId=]` adds
  `rules { allowMemberGl, rejectReasonMin: 3 }` and per claim `glAllowed`, `editableFields`.
  Show the guest-list field only when `glAllowed`; omit `guestCount` otherwise (server then uses 0).
  Disallowed GL → 422 `fields.guestCount = "ux.claims.glNotAllowed"` (member submit and review).
  Reject reason required (`ux.claims.reasonRequired`). Member form title `ux.claims.bonusTitle/Body` (UX14).
- **Card fees (UX27, F26, F29)**: `CardInfo.replacementFee { amount, paidAt } | null` on
  `GET /api/admin/cards/members/:id` etc. Record: `POST /api/admin/payments { "kind": "card", "id": cardId }`.
- **Public card** `GET /api/c/:token`: `member.quote` added (the 21 Oct KTM prints QOTD).
- `GET /api/admin/event-form` `defaults.descriptionNeedsApproval` (true for regional admins).

## 12. Strings (EN / ID)

All keys live under `ux.` in `packages/shared/src/i18n/{en,id}.ts`. Placeholders in `{braces}`.

| Key | EN | ID |
|---|---|---|
| `ux.nav.home` | Home | Beranda |
| `ux.nav.events` | Events | Event |
| `ux.nav.card` | Card | Kartu |
| `ux.nav.community` | Community | Komunitas |
| `ux.nav.account` | Account | Akun |
| `ux.adminMode.title` | Admin mode | Mode admin |
| `ux.adminMode.body` | Show staff tools across Home, Events and Community. It doesn't change your role or permissions. | Tampilkan alat staf di Beranda, Event, dan Komunitas. Peran dan izinmu tidak berubah. |
| `ux.adminMode.on` | Admin mode · {scope} | Mode admin · {scope} |
| `ux.adminMode.exit` | Exit Admin mode | Keluar dari mode admin |
| `ux.adminMode.scopeHq` | HQ, all cities | HQ, semua kota |
| `ux.adminMode.scopeCity` | Regional Admin · {city} | Admin Regional · {city} |
| `ux.adminMode.openIn` | Open in Admin mode | Buka di mode admin |
| `ux.adminMode.finishFirst` | Finish or cancel the current scan before switching mode. | Selesaikan atau batalkan scan yang sedang berjalan sebelum ganti mode. |
| `ux.welcome.title` | Welcome to PATS University | Selamat datang di PATS University |
| `ux.welcome.cardNow` | Your digital card works now. Show its QR to the crew at the door. | Kartu digitalmu sudah bisa dipakai. Tunjukkan QR-nya ke crew di pintu masuk. |
| `ux.welcome.crewConfirms` | The crew confirms your check-in; you'll see it in the app right after. | Crew yang mengonfirmasi check-in-mu; hasilnya langsung muncul di app. |
| `ux.welcome.physicalCard` | Your physical KTM is prepared separately and handed to you at an event in {city}. | KTM fisikmu disiapkan terpisah dan diserahkan di event di {city}. |
| `ux.welcome.photo` | Add a photo so the crew can match your face. | Tambahkan foto agar crew bisa mencocokkan wajahmu. |
| `ux.welcome.staff` | Staff tools live in Account → Admin mode. | Alat staf ada di Akun → Mode admin. |
| `ux.welcome.start` | Get started | Mulai |
| `ux.welcome.skip` | Skip | Lewati |
| `ux.otp.signInTitle` | Sign in with your email | Masuk dengan email |
| `ux.otp.signInBody` | We'll email you a 6-digit code. No password needed. | Kami kirim kode 6 digit ke email-mu. Tanpa kata sandi. |
| `ux.otp.sentTo` | Code sent to {email} | Kode dikirim ke {email} |
| `ux.otp.validFor` | Valid for {minutes} minutes. | Berlaku {minutes} menit. |
| `ux.otp.checkSpam` | Not there? Check spam or promotions. | Belum masuk? Cek folder spam atau promosi. |
| `ux.otp.changeEmail` | Change email | Ganti email |
| `ux.otp.resent` | Code resent to {email}. | Kode dikirim ulang ke {email}. |
| `ux.otp.notMember` | Not a member yet? Register on the web, then come back and sign in with the same email. | Belum jadi member? Daftar di web, lalu kembali dan masuk dengan email yang sama. |
| `ux.staff.noMembershipTitle` | No personal member card | Tidak ada kartu member pribadi |
| `ux.staff.noMembershipBody` | This staff account has no PATS membership, so there's no NIM, card or XP. Staff tools are in Account → Admin mode. | Akun staf ini tidak punya keanggotaan PATS, jadi tidak ada NIM, kartu, atau XP. Alat staf ada di Akun → Mode admin. |
| `ux.card.title` | Card | Kartu |
| `ux.card.subtitle` | KTM — your PATS member card | KTM — kartu member PATS-mu |
| `ux.card.digitalTitle` | Digital check-in QR | QR check-in digital |
| `ux.card.digitalReady` | Ready now | Siap dipakai |
| `ux.card.digitalReadyBody` | Show this QR to the crew. It works before your physical card arrives. | Tunjukkan QR ini ke crew. Bisa dipakai sebelum kartu fisikmu datang. |
| `ux.card.digitalInactive` | Not available: your membership is inactive. | Tidak tersedia: keanggotaanmu tidak aktif. |
| `ux.card.showQr` | Show check-in QR | Tampilkan QR check-in |
| `ux.card.showToCrew` | Show this to crew; your check-in is recorded after they confirm. | Tunjukkan ke crew; check-in tercatat setelah mereka konfirmasi. |
| `ux.card.qrRefresh` | Refreshes every {seconds}s. Screenshots expire. | Diperbarui tiap {seconds} detik. Screenshot tidak berlaku. |
| `ux.card.flip` | Flip card | Balik kartu |
| `ux.card.physicalTitle` | Physical card | Kartu fisik |
| `ux.card.stage.queued` | Queued for printing | Dalam antrean cetak |
| `ux.card.stage.printing` | Being printed | Sedang dicetak |
| `ux.card.stage.atHq` | At HQ, being prepared | Di HQ, sedang disiapkan |
| `ux.card.stage.encoded` | Ready at HQ, not shipped yet | Siap di HQ, belum dikirim |
| `ux.card.stage.shipped` | Arrived in {city}: pick it up at the next event | Sudah sampai di {city}: ambil di event berikutnya |
| `ux.card.stage.delivered` | Active: tap it at the door | Aktif: tempelkan di pintu masuk |
| `ux.card.stage.inactive` | This physical card is inactive. Ask the crew about a replacement. | Kartu fisik ini nonaktif. Tanyakan penggantinya ke crew. |
| `ux.card.fields.name` | NAME | NAME |
| `ux.card.fields.drink` | FAVORITE DRINK | FAVORITE DRINK |
| `ux.card.fields.quote` | QOTD | QOTD |
| `ux.card.quoteHint` | QOTD — your quote of the day, printed on your card. | QOTD — quote andalanmu, tercetak di kartu. |
| `ux.card.feeDue` | Replacement fee {amount} — pay the crew; they record it. | Biaya kartu pengganti {amount} — bayar ke crew; crew yang mencatat. |
| `ux.card.feePaid` | Replacement fee paid {date} | Biaya kartu pengganti lunas {date} |
| `ux.home.nextTitle` | What's next | Selanjutnya |
| `ux.home.noEvent` | No upcoming event in {city} yet. | Belum ada event mendatang di {city}. |
| `ux.home.browseNational` | Browse other cities | Lihat kota lain |
| `ux.journey.event` | Check the next event | Cek event berikutnya |
| `ux.journey.poster` | Blast the poster | Sebarkan poster |
| `ux.journey.posterPending` | Details coming soon from HQ. | Detailnya segera dari HQ. |
| `ux.journey.reservation` | Reserve a table or sofa | Reservasi meja atau sofa |
| `ux.journey.reservationBonus` | +{xp} XP at check-in with a confirmed reservation | +{xp} XP saat check-in dengan reservasi terkonfirmasi |
| `ux.journey.reservationSkip` | Not this time | Lain kali |
| `ux.journey.reservationRequested` | Waiting for crew approval | Menunggu persetujuan crew |
| `ux.journey.checkIn` | Check in at the door | Check-in di pintu masuk |
| `ux.journey.completed` | Completed | Selesai |
| `ux.journey.markDone` | Mark as done | Tandai selesai |
| `ux.journey.done` | Done | Selesai |
| `ux.events.national` | National | Nasional |
| `ux.events.nationalOn` | Events in all active cities | Event di semua kota aktif |
| `ux.events.nationalOff` | Events in {city} | Event di {city} |
| `ux.events.upcoming` | Upcoming | Mendatang |
| `ux.events.past` | Past | Selesai |
| `ux.events.viewEvent` | View event | Lihat event |
| `ux.events.reservation` | Reservation | Reservasi |
| `ux.events.otherCity` | Other city | Kota lain |
| `ux.timing.starts` | Starts | Mulai |
| `ux.timing.ends` | Ends | Selesai |
| `ux.timing.checkInOpens` | Check-in opens | Check-in dibuka |
| `ux.timing.checkInCloses` | Check-in closes | Check-in ditutup |
| `ux.timing.overnight` | Runs past midnight | Berlangsung lewat tengah malam |
| `ux.timing.opensBefore` | Check-in opens {minutes} minutes before the start | Check-in dibuka {minutes} menit sebelum mulai |
| `ux.timing.minutesBefore` | minutes before the start | menit sebelum mulai |
| `ux.reason.eventEnded` | This event has ended. | Event ini sudah selesai. |
| `ux.reason.eventNotEnded` | Available after the event ends. | Tersedia setelah event selesai. |
| `ux.reason.noVenue` | This event has no venue for reservations. | Event ini tidak punya venue untuk reservasi. |
| `ux.reason.reservationExists` | You already have a reservation for this event. | Kamu sudah punya reservasi untuk event ini. |
| `ux.reason.noCityAccess` | Request access to this city first. | Minta akses ke kota ini dulu. |
| `ux.reason.checkInNotOpen` | Check-in isn't open yet. | Check-in belum dibuka. |
| `ux.reason.alreadyCheckedIn` | You're checked in. | Kamu sudah check-in. |
| `ux.reason.roamingRequired` | Request to attend this other-city event first. | Ajukan izin hadir di event kota lain ini dulu. |
| `ux.reason.homeCity` | This event is in your city. | Event ini di kotamu. |
| `ux.reason.claimSubmitted` | You already submitted a claim for this event. | Kamu sudah mengajukan klaim untuk event ini. |
| `ux.reason.drawNotConfigured` | No prize draw at this event. | Tidak ada undian di event ini. |
| `ux.roaming.visitTitle` | Visit another city | Kunjungi kota lain |
| `ux.roaming.attend` | Attend this event | Hadir di event ini |
| `ux.roaming.attendBody` | The {city} crew approves. Not a reservation or immediate entry. | Crew {city} yang menyetujui. Bukan reservasi atau akses masuk langsung. |
| `ux.roaming.hub` | Temporary {city} Community access | Akses Komunitas {city} sementara |
| `ux.roaming.hubBody` | HQ approves. Access ends {hours} hours after the event. | HQ yang menyetujui. Akses berakhir {hours} jam setelah event. |
| `ux.roaming.eventChanged` | The event changed. Choose it again before sending. | Event berubah. Pilih lagi sebelum mengirim. |
| `ux.roaming.homeCityError` | This event is in your own city; no request is needed. | Event ini di kotamu sendiri; tidak perlu pengajuan. |
| `ux.roaming.requestExists` | You already have a request for this event. | Kamu sudah punya pengajuan untuk event ini. |
| `ux.roaming.monthlyLimit` | You've reached this month's request limit. | Batas pengajuan bulan ini sudah tercapai. |
| `ux.reservation.title` | Reservation | Reservasi |
| `ux.reservation.mine` | My reservations | Reservasiku |
| `ux.reservation.review` | Review your request | Periksa pengajuanmu |
| `ux.reservation.send` | Send reservation request | Kirim permintaan reservasi |
| `ux.reservation.pendingTitle` | Pending — waiting for crew approval | Menunggu persetujuan crew |
| `ux.reservation.confirmedTitle` | Confirmed | Terkonfirmasi |
| `ux.reservation.minimumCharge` | Minimum charge {amount} | Minimum charge {amount} |
| `ux.reservation.depositUnpaid` | Deposit not recorded yet | DP belum tercatat |
| `ux.reservation.depositPaid` | Deposit {amount} recorded {date} | DP {amount} tercatat {date} |
| `ux.reservation.depositOffApp` | Pay the deposit to the crew outside the app; they record it here. | Bayar DP ke crew di luar app; crew yang mencatatnya di sini. |
| `ux.reservation.blocked` | Your reservation for {event} has no deposit yet. New bookings open after the crew records it. | Reservasimu untuk {event} belum ada DP. Booking baru terbuka setelah crew mencatat DP. |
| `ux.reservation.openBlocking` | Open that reservation | Buka reservasi itu |
| `ux.reservation.recordDeposit` | Record deposit received | Catat DP diterima |
| `ux.reservation.depositAmount` | Deposit amount | Nominal DP |
| `ux.reservation.depositConfirm` | Record a deposit of {amount} for {member}? This unlocks their next booking. | Catat DP {amount} untuk {member}? Booking berikutnya akan terbuka. |
| `ux.reservation.cancelConfirm` | Cancel your reservation for {slot} at {event}? The slot goes back to others. | Batalkan reservasi {slot} di {event}? Slotnya kembali tersedia untuk yang lain. |
| `ux.reservation.posterHint` | Tap to see the full poster and details | Ketuk untuk melihat poster dan detail lengkap |
| `ux.reservation.kind.TABLE` | Table | Meja |
| `ux.reservation.kind.SOFA` | Sofa | Sofa |
| `ux.reservation.kind.OTHER` | Other | Lainnya |
| `ux.content.title` | Poster & description | Poster & deskripsi |
| `ux.content.live` | Live for members | Tayang untuk member |
| `ux.content.pending` | Waiting for HQ approval | Menunggu persetujuan HQ |
| `ux.content.approvalHint` | Your changes go to HQ for approval before members see them. | Perubahanmu dikirim ke HQ untuk disetujui sebelum terlihat member. |
| `ux.content.directHint` | Changes are live for members as soon as you save. | Perubahan langsung tayang untuk member begitu disimpan. |
| `ux.content.submit` | Send to HQ | Kirim ke HQ |
| `ux.content.save` | Save | Simpan |
| `ux.content.submitted` | Sent to HQ for approval. | Terkirim ke HQ untuk disetujui. |
| `ux.content.saved` | Poster and description updated. | Poster dan deskripsi diperbarui. |
| `ux.content.approve` | Approve | Setujui |
| `ux.content.reject` | Reject | Tolak |
| `ux.content.rejectReason` | Reason (the admin sees it) | Alasan (terlihat oleh admin) |
| `ux.content.approved` | Approved: now live for members. | Disetujui: sekarang tayang untuk member. |
| `ux.content.rejected` | Rejected. | Ditolak. |
| `ux.content.queueTitle` | Poster approvals | Persetujuan poster |
| `ux.content.queueEmpty` | No submissions waiting | Tidak ada pengajuan yang menunggu |
| `ux.content.queueEmptyBody` | Posters and descriptions from regional admins show up here for approval. | Poster dan deskripsi dari admin regional muncul di sini untuk disetujui. |
| `ux.content.posterLabel` | Poster | Poster |
| `ux.content.descriptionLabel` | Description | Deskripsi |
| `ux.content.noChange` | Change the poster or the description first. | Ubah poster atau deskripsi dulu. |
| `ux.content.replacesPending` | This replaces your earlier submission that's still waiting. | Ini menggantikan pengajuanmu sebelumnya yang masih menunggu. |
| `ux.content.by` | By {name} · {date} | Oleh {name} · {date} |
| `ux.content.statusPENDING` | Waiting | Menunggu |
| `ux.content.statusAPPROVED` | Approved | Disetujui |
| `ux.content.statusREJECTED` | Rejected | Ditolak |
| `ux.content.statusWITHDRAWN` | Replaced | Digantikan |
| `ux.workspace.title` | Event workspace | Ruang kerja event |
| `ux.workspace.overview` | Overview | Ringkasan |
| `ux.workspace.attendance` | Attendance | Kehadiran |
| `ux.workspace.reservations` | Reservations | Reservasi |
| `ux.workspace.claims` | Claims | Klaim |
| `ux.workspace.draw` | Draw | Undian |
| `ux.workspace.rewards` | Rewards | Reward |
| `ux.workspace.recap` | Recap | Rekap |
| `ux.workspace.chooseScanEvent` | Choose event to scan | Pilih event untuk scan |
| `ux.workspace.noOpenEvent` | No event is open for check-in | Tidak ada event yang dibuka untuk check-in |
| `ux.workspace.nextOpens` | Next: {event} opens {time} | Berikutnya: {event} dibuka {time} |
| `ux.workspace.checkInEnded` | Check-in ended {time} | Check-in berakhir {time} |
| `ux.workspace.openEarly` | Open check-in now | Buka check-in sekarang |
| `ux.workspace.openEarlyBody` | Check-in starts now instead of {time}. Members can be scanned right away. | Check-in dimulai sekarang, bukan {time}. Member bisa langsung discan. |
| `ux.workspace.manageInDashboard` | Manage in dashboard | Kelola di dashboard |
| `ux.workspace.pendingWork` | Pending work | Pekerjaan tertunda |
| `ux.workspace.pending.claims` | Claims to review | Klaim untuk ditinjau |
| `ux.workspace.pending.reservations` | Reservations to decide | Reservasi untuk diputuskan |
| `ux.workspace.pending.deposits` | Deposits to record | DP untuk dicatat |
| `ux.workspace.pending.roaming` | Visiting-city requests | Pengajuan kota lain |
| `ux.workspace.pending.hubAccess` | Community access requests | Pengajuan akses Komunitas |
| `ux.workspace.pending.reencode` | Re-encode requests | Permintaan encode ulang |
| `ux.workspace.pending.regionChanges` | Home city changes | Pindah kota asal |
| `ux.workspace.pending.content` | Poster approvals | Persetujuan poster |
| `ux.workspace.pending.myContent` | My posters waiting for HQ | Posterku menunggu HQ |
| `ux.workspace.pending.recapsDue` | Recaps to fill | Rekap untuk diisi |
| `ux.recap.sold` | Reservations sold | Reservasi terjual |
| `ux.recap.soldTable` | Tables sold | Meja terjual |
| `ux.recap.soldSofa` | Sofas sold | Sofa terjual |
| `ux.recap.soldHint` | Confirmed reservations at this event, by slot type in the floor plan. | Reservasi terkonfirmasi di event ini, per jenis slot di denah. |
| `ux.recap.fdcSold` | FDC sold | FDC terjual |
| `ux.recap.fdcPending` | Waiting for HQ to define FDC | Menunggu definisi FDC dari HQ |
| `ux.notif.markAllRead` | Mark all read | Tandai semua dibaca |
| `ux.notifAction.viewEvent` | View event | Lihat event |
| `ux.notifAction.viewAttendance` | View attendance | Lihat kehadiran |
| `ux.notifAction.openCard` | Open card | Buka kartu |
| `ux.notifAction.openBooking` | Open booking | Buka reservasi |
| `ux.notifAction.reviewBooking` | Review booking | Tinjau reservasi |
| `ux.notifAction.reviewRequest` | Review request | Tinjau pengajuan |
| `ux.notifAction.viewRequest` | View request | Lihat pengajuan |
| `ux.notifAction.viewClaim` | View claim | Lihat klaim |
| `ux.notifAction.reviewClaim` | Review claim | Tinjau klaim |
| `ux.notifAction.reviewPoster` | Review poster | Tinjau poster |
| `ux.notifAction.viewPoster` | View poster | Lihat poster |
| `ux.notifAction.openChat` | Open chat | Buka chat |
| `ux.notifAction.open` | Open | Buka |
| `ux.claims.bonusTitle` | Claim bonus XP | Ajukan bonus XP |
| `ux.claims.bonusBody` | Check-in XP is automatic. This form reports qualifying reservations after the event for review. | XP check-in otomatis. Form ini melaporkan reservasi yang memenuhi syarat setelah event untuk ditinjau. |
| `ux.claims.glNotAllowed` | Guest list isn't counted on member claims. | Guest list tidak dihitung pada klaim member. |
| `ux.claims.reasonRequired` | A reason is required to reject. | Alasan wajib diisi untuk menolak. |
| `ux.draw.staffTitle` | Live prize draw | Undian langsung |
| `ux.draw.runWhenFull` | Run the draw once every slot is taken during the peak window. | Jalankan undian saat semua slot terisi di jam peak. |
| `ux.archive.prReports` | PR reports · archive (read only) | Laporan PR · arsip (baca saja) |
| `ux.archive.prReportsBody` | Old PR reports are kept for reference. New bonus XP goes through Claims. | Laporan PR lama disimpan sebagai referensi. Bonus XP baru lewat Klaim. |

Push copy (`push.<kind>.title` / `.body`):

| Kind | EN | ID |
|---|---|---|
| `contentSubmitted` | Poster to approve — {sender} sent a poster/description for {event}. | Poster perlu disetujui — {sender} mengirim poster/deskripsi untuk {event}. |
| `contentDecided` | Poster update — {event}: {status}. | Update poster — {event}: {status}. |

## 13. KTM print + artwork

- Default print template `apps/web/card-templates/ktm-2026-qotd` (21 Oct artwork; NAME / FAVORITE DRINK /
  QOTD; white QR in the maroon tile; CR80 + 3 mm bleed; per-member PDF + batch PDF + CSV unchanged).
  `ktm-2026` (FAVORITE GENRE) kept for reference. HQ regenerates a batch's files to print the new design.
- Screen artwork: `apps/web/public/ktm/{front,back}-{800,1600}.webp` regenerated from the 21 Oct masters
  (Android's sync script copies them). iOS: replace the card front/back assets with the same files.
- Geometry unchanged (`packages/shared/src/tokens.ts` `ktm`): third value at `quoteY` (= old `genreY`),
  up to `quoteMaxLines` (2) full-size lines, then shrink.
