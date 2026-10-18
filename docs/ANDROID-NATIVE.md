# PATS University native Android

18 October 2026. Package `id.znetworks.patsuniv`, Kotlin + Jetpack Compose in `apps/android`.
The existing web API and realtime service remain unchanged. iOS should mirror the screen and
endpoint inventory below. Phase 5 business rules supersede the historical wheel and PR-report flows.

## Phase status

| Phase | Status | Validation |
|---|---|---|
| 1 Foundation | Complete | 4 JVM tests and debug APK pass; real demo OTP member/admin login, EN/ID profiles, navigation, logout and card-link error on Pixel_10_Pro |
| 2 Member screens | Complete | 7 JVM tests and debug APK pass; 19 member routes plus receipt/media and mutation states captured and inspected on Pixel_10_Pro |
| 3 Admin screens | Implemented; owner review open | 15 JVM tests and debug APK pass; regional and HQ screens, native camera, manual check-in, claims, reward handover, event create/edit/open and reservation confirmation inspected on Pixel_10_Pro; review notes requested after an incomplete message |
| 4 Parity | Audit and checks green; final review open | 18 JVM tests and debug APK pass; Expo screen/API inventory audited; EN/light and ID/dark captures, compact width and 1.4× text inspected; final closure awaits the missing Phase 3 review notes |

Foundation includes the PATS palette, Inter/Jakarta fonts, shared EN/ID dictionaries, member/admin
shell, public card links, loading/error states, OTP demo-code display, cooldown, logout, refreshed
sessions and a Socket.IO room client. Token storage uses Android Keystore AES-GCM in no-backup storage,
following NEXUS's pattern. Refresh rotation is serialized and does not clear sessions for transport errors.

## Build and device

```powershell
cd apps/android
$env:JAVA_HOME = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'User')
$env:ANDROID_HOME = [Environment]::GetEnvironmentVariable('ANDROID_HOME', 'User')
.\gradlew.bat testDebugUnitTest assembleDebug
```

Gradle heap is limited to 3 GB, workers to two. Default API is the requested Tailscale dev server;
override with `-PpatsApiUrl=https://...`. `node scripts/sync-shared.mjs` imports the shared dictionaries
and palette. Existing crest assets are reused. No backend/database changes, accounts or pushes.

Use only `Pixel_10_Pro` and explicitly pass its serial to every ADB command. Owner changed the setup
during Phase 2: use a visible window and host GPU, with
`emulator -avd Pixel_10_Pro -gpu host -no-audio -no-snapshot-save -no-boot-anim`.
The restarted emulator log confirms NVIDIA GeForce RTX 5070. It was identified as
`emulator-5554`; `emulator-5556` belongs to Pixel_7 and is not touched. Windows resolves the dev host
but the emulator did not, even with `-dns-server 100.100.100.100`. Its direct Tailscale IP route works.
For this emulator build, `'-PpatsDevIp=100.125.230.1'` supplies a **debug-only DNS override** for the
configured API hostname; HTTPS hostname and certificate checks stay enabled. Release ignores this
property. No Windows settings changed. Capture PNG bytes with the provided Node helper
because Windows PowerShell text redirection can corrupt `adb exec-out screencap` binary output.
Phase 1 screenshots were captured and visually inspected in `C:/Users/Berlin/Documents/Dev/pats-shots/1-*.png`.

## Screen/API inventory (iOS reference)

| Screen / service | Existing API contract |
|---|---|
| Login / verification | POST `/api/auth/otp/request` `{email,locale,audience:"app"}` → `expiresAt,resendAfter,demoCode?`; POST `/api/auth/otp/verify` `{email,code,client:"app"}` → tokens + `me` |
| Session | POST `/api/auth/refresh` `{refreshToken}` → rotated tokens; POST `/api/auth/logout` `{refreshToken}` |
| Profile / role navigation | GET `/api/me`, PATCH `/api/me` `{locale}`; use server `user.capabilities`, including legacy LOCAL_ADMIN alias |
| Public card link | GET `/api/c/:token`, with bearer token when signed in; active/pending/revoked/inactive state, restricted public member data |
| Realtime | GET `/api/social/token` → `{token,url}`; Socket.IO websocket auth `{token}`; `join {kind,id}`, `message`, `changed`, `access_lost` |
| Card + rotating QR | GET `/api/me/card-token` → `token,expiresAt,ttlSeconds,serverTime`; correct TTL using server time, hide expired QR; keep screen awake |
| Events + event detail | GET `/api/events` (home city), GET `/api/events?scope=all`, GET `/api/events/:id`, GET `/api/events/:id/flyer` |
| Attendance history | GET `/api/me/check-ins` |
| Rewards / wallet | GET `/api/loyalty/wallet`; POST `/api/loyalty/redeem` `{eventId,rewardId}`; venue-filtered catalogue; live wallet room; codes + QR + countdown; ledger, expiry, milestone |
| Leaderboard | GET `/api/loyalty/leaderboard?cityId=&month=&eventId=`; server mode/period, city/national, own position |
| Claim XP / promoter | GET `/api/loyalty/claims`; POST/PATCH `/api/loyalty/claims` `{eventId,formType,guestCount,reservationCount,receiptUrl,notes,id?}`; MEMBER/PR forms, pending-only edits |
| Receipt capture | POST `/api/loyalty/receipt-upload` `{contentType}` → `{key,uploadUrl}`; PUT JPEG bytes to signed uploadUrl; max 5 MB; CameraX preview/capture |
| Live prize draw / wheel | GET `/api/loyalty/draw?eventId=`; POST `/api/loyalty/spin` `{eventId}`; server result and five name slots; room `draw`; quarterly free credit; no legacy weighted spin |
| Region request | GET/POST `/api/me/region-change`, POST body `{cityId,reason}`; request status and HQ note |
| Leave membership | POST `/api/me/leave`, confirm then clear session |
| Social hub | GET `/api/social/hub`; allowed cities and channels, server posting/media rules |
| Channel / reservation chat | GET `/api/social/feed?kind=channel\|conversation&id=&cursor=`; pagination; POST `/api/social/messages` or socket `message` with `{channelId\|conversationId,body,mediaKey?,mediaType?}` |
| Timeline / reactions | POST `/api/social/posts` `{channelId,body,mediaKey?}` (HQ only), POST `/api/social/react` `{postId,active}` |
| Social capture/playback | POST `/api/social/upload` `{room:{kind,id},contentType}` → `{key,url,maxBytes}`; PUT bytes; signed `mediaUrl` playback; JPEG, AAC/M4A voice, MP4 video |
| Social channel management | POST `/api/social/channels` `{id?,cityId,name,kind,visibility,memberPosting,archived}` |
| Social moderation | POST `/api/social/moderate`: `pin {id,pinned}`, `deletePost {id}`, `deleteMessage {id}`, `mute {cityId,userId,muted}` |
| Reservation floor plan | GET `/api/social/slots?eventId=`; POST `/api/social/reserve` `{eventId,slotCode,pax,note}` → conversationId; grid plus accessible slot selector |
| Roaming request | POST `/api/social/roaming` `{eventId,type:ATTENDANCE\|SOCIAL_HUB}` |
| Community operations | GET `/api/social/operations`; POST `/api/social/reservation-decision` `{id,status:CONFIRMED\|REJECTED\|CANCELLED}`; POST `/api/social/roaming-decision` `{id,decision:APPROVED\|REJECTED}`; status, conversation, expiry, moderation summaries |
| Notifications | GET `/api/me/notifications`; POST `/api/me/notifications/read` `{all:true}` |
| Notification preferences | GET/PATCH `/api/me/notification-prefs` `{events?:boolean,activity?:boolean}` |
| Admin tools / scan event picker | GET `/api/admin/events` → upcoming/past; server capabilities control each tool |
| Event attendance / lifecycle | GET `/api/admin/events/:id`, GET `/api/admin/events/:id/attendance`; room `attendance`; POST `/api/admin/events/:id/actions` `{action:publish\|open\|close}` |
| Regional event editor | GET `/api/admin/event-form`; POST `/api/admin/events`, PATCH `/api/admin/events/:id` with local date/times, title, description, venue, capacity, opening offset and publish; server applies city timezone and overnight end |
| NFC / camera QR / manual check-in | POST `/api/admin/check-in/preview` `{eventId,method,token,nfcUid?}` or `{eventId,method:MANUAL,memberId}`; POST `/api/admin/check-in` with ticket or manual member/reason; GET `/api/admin/events/:id/members?q=` |
| Handover | POST `/api/admin/cards/handover/preview`, POST `/api/admin/cards/handover` `{token,nfcUid}`; explicit name confirmation before commit |
| Card search / lost / re-encode | GET `/api/admin/cards/members?q=`, GET `/api/admin/cards/members/:id`; POST `/api/admin/cards/:id/revoke` `{reason}`, POST `/api/admin/cards/:id/reencode-requests` `{reason}` |
| HQ encoding batches | GET `/api/hq/batches`; batch progress and any-card lookup; per-install station identifier allows parallel phones of the same model |
| Phone encoding / approved re-encode | POST `/api/hq/cards/prepare` `{lookup,station,mode,batchId?,grantId?}` → lease; POST `/api/hq/cards/:id/key` `{leaseId,nfcUid}` → transient URL/PWD/PACK; POST `/api/hq/cards/:id/encoded` `{leaseId,nfcUid,protectedNow,chipType}`; POST `/api/hq/cards/:id/release` `{leaseId,failure?}`; retry failed reports without rewriting |
| Reward validation | POST `/api/admin/loyalty/codes/preview`, POST `/api/admin/loyalty/codes/fulfill` `{eventId,code}`; camera or six-character entry; confirmation before handover |
| Claim review | GET/POST `/api/admin/loyalty/claims`; POST `{id,decision,guestCount,reservationCount,reason}`; GET `/api/loyalty/claims/:id/receipt?format=json` → private signed image |
| City / crew operations | GET `/api/admin/loyalty/operations`; POST `/api/admin/loyalty/recaps` with seven counts/revenues, PIC, accountable person and note; POST `/api/admin/loyalty/promoters/:memberId` `{enabled}` |
| Historical PR records | Read-only reports and payouts from operations; GET `/api/loyalty/receipts/:id?format=json`; new submissions use Claim XP |
| Admin live draw | POST `/api/admin/draw` `{eventId,action:"run"}`; the server saves the winner, the phone only animates that result |

## Expo route parity / native destinations

Paths below are relative to `apps/mobile/src/app`. Layout and index redirect files are shell behavior,
not additional screens. Shared feature components are implemented in the Kotlin files named here.

| Expo route | Native route / implementation |
|---|---|
| `(auth)/login`, `(auth)/verify` | `Login` in MainActivity; request, demo OTP, verify, resend cooldown, change email |
| `(member)/(tabs)/card` | `card` / MemberCard; QR expiry, screen awake, physical status, attendance and unread summaries |
| `(member)/(tabs)/events` | `events` / Events; city/all-city list, phases, attendance |
| `(member)/event/[id]` | `event/:id` / EventDetail; flyer, venue, city times, reservation, roaming, draw |
| `(member)/(tabs)/rewards` | `wallet` / Wallet; catalogue, venue filtering, redemption, code QR/countdown, XP expiry/ledger |
| `(member)/(tabs)/hub` | `hub` / Hub; allowed cities/channels and operations shortcuts |
| `(member)/(tabs)/profile` | `profile` / Profile; identity, XP, PR badge, locale, settings, leave/logout confirmation |
| `(member)/claims` | `claims` / Claims; MEMBER/PR selection, receipt, pending edits, decisions/XP |
| `(member)/promoter` | `promoter` / Claims; Phase 5 replaces historical report submission |
| `(member)/leaderboard` | `leaderboard` / Leaderboard; city/national, server mode/period, event filters and own rank |
| `(member)/history` | `history` / History |
| `(member)/region-change` | `region-change` / RegionChange |
| `(admin)/(tabs)/tools` | `tools` / AdminTools; capability-filtered tools |
| `(admin)/(tabs)/account` | `profile` / Profile with admin identity/locale/logout |
| `(admin)/scan/index` | `scan` / Events with open-event filter |
| `(admin)/scan/[eventId]/index` | `scan/:id` / Scan; NFC reader, CameraX/ZXing, preview/ticket and explicit confirmation |
| `(admin)/scan/[eventId]/manual` | `manual/:id` / Scan; name/NIM search, reason, audited confirmation |
| `(admin)/city-events/index` | `city-events` / Events with regional create action |
| `(admin)/city-events/[id]/index` | `city-event/:id` / AdminEventDetail; lifecycle and live attendance |
| `(admin)/city-events/new` | `event-new` / EventEditor and EventForm |
| `(admin)/city-events/[id]/edit` | `event-edit/:id` / EventEditor and EventForm; native calendar/time pickers |
| `(admin)/claims-review` | `claims-review` / ClaimsReview; private image, adjusted counts, approve/reject |
| `(admin)/reward-validation` | `reward-validation` / RewardValidation; code/QR, preview, handover |
| `(admin)/operations` | `operations` and `crew` / CrewOperations; recap, promoter flag, historical PR records |
| `(admin)/member-cards/index` | `member-cards` / MemberCards |
| `(admin)/member-cards/[id]` | `member-card/:id` / MemberCardDetail; lost/revoke, request re-encode, approved grant |
| `(admin)/handover` | `handover` / Handover; NFC identity preview and confirm |
| `(admin)/encode/index` | `encode` / EncodeHome; batches and progress |
| `(admin)/encode/run` | `encode-run/:batchId?` or `reencode/:grantId/:nim` / EncodeRun; station leases, verify/protect/report/retry/release |
| `notifications` | `notifications` / Notifications; read-all and server payload destinations |
| `notification-settings` | `notification-settings` / NotificationSettings; category preferences |
| `reservation` | `reservation/:eventId` / Reservation; floor plan, accessible selector, capacity/minimum charge, private chat |
| `roaming` | `roaming/:eventId?` / Roaming; attendance/social grant request and status shortcut |
| `social-hub` | `social-hub` / Hub (same destination as the hub tab) |
| `social-channel` | `channel/:id` or `conversation/:id` / Feed; realtime, pagination, media, reactions, moderation and channel management |
| `social-operations` | `social-operations` / SocialOperations; reservations, roaming decisions, mutes and screenshot records |
| `c/[token]` | Android App Link/NDEF intent / public card view in MainActivity; public state/profile and own-card shortcut |
| All `_layout` files and `index` | App/Shell; encrypted restored session, role/capability guard, Android back stack and tabs |

Endpoint audit: every Expo REST call is mapped above. Android intentionally omits Expo-token
POST/DELETE `/api/me/devices` until the existing Expo-only sender gains FCM support; do not submit
an FCM token to that provider. The iOS-only screenshot report is replaced by Android FLAG_SECURE.
Signed storage PUT/GET calls do not carry session bearer tokens. Flyer loading uses its existing
public URL; no new server endpoints or contracts were introduced.

Phase 2 debug screenshot navigation uses `qaRoute` intent extras; it cannot authenticate a user or bypass
server authorization. `qaCapture=true` temporarily permits channel capture in **debug only** for visual QA;
normal runs and release protect channels with FLAG_SECURE. Scripts use actual UI OTP login. Local API
fixture sessions and UI XML are in ignored `.qa/`; screenshots are outside Git.

The demo server returns signed receipt/social URLs on `patsuniv.znetworks.id`, which does not resolve
on this PC. Debug media fetch/upload preserves the signed path/query and uses the configured dev origin.
Release does not rewrite URLs. The owner should set the deployment's APP_URL to its reachable origin.
Demo fixtures are named `Android QA · …` and created through existing APIs; no seed/reset/schema change.

Phase 2 interaction checks passed through native controls: real JPEG receipt capture + private PUT,
create/edit pending member claim, reward issue with QR/countdown, one draw entry (250 XP debit from
server), reservation → private conversation, text messages with socket acknowledgement, AAC voice and
MP4 video capture/upload/send. Another demo account's message appeared immediately through the actual
Socket.IO connection, before the 15-second REST fallback. Server feed confirms VOICE and VIDEO items.
Screenshots `2-*.png` include empty/populated/loading-permission states; receipt preview overflow and
signed media origin failures were fixed and retested. Video output paths survive activity recreation.
The iOS-only `/api/social/screenshot` reporting endpoint is not called on Android; Android uses prevention.
Language/theme and all admin routes are included in the final parity pass.

## Owner tasks and limits

- **NFC hardware:** emulator has no NFC. Physical verification requires Berlin's Android phone and
  NTAG213/215/216 cards, including password protection, interruption/recovery and parallel stations.
- **Push:** server supports Expo push tokens, not direct FCM tokens. Keep the in-app notification
  centre. Owner must provide a Firebase Android app for this package and project/sender/API/app IDs;
  the server needs FCM HTTP v1 credentials, a provider/token type, device registration and unregister,
  invalid-token cleanup, category handling, and deep-link payload delivery. No Firebase account created.
- **Release:** Play Console ownership, release keystore kept outside Git, signing/backup, app listing,
  privacy/legal assets and `ANDROID_CERT_SHA256` for verified App Links remain owner tasks.
- Existing HQ dependencies (final artwork/legal and T9 notification copy) remain unchanged.

Phase 3 uses CameraX + ZXing for QR and NfcAdapter reader mode behind `CardReader`/`TagIo`.
The JVM fake executes the shared card-station command fixtures for NTAG213/215/216, tests interruption
at every command, recovery, password/PACK failures, read-back, locked/unsupported tags and NDEF parsing.
Static/dynamic lock pages and the capability container are never written. Physical outcomes are not
simulated as successful server encodes on the emulator. Screenshots are `3-*.png` beside Phase 2 evidence.
Native claim review opened the actual private camera receipt and adjusted reservations from 2 to 3;
the server approved it for 75 XP. Native manual check-in, reward issue/preview/fulfillment, reservation
confirmation/private chat and event create/edit/open all passed against the existing APIs.
The backend has no event deletion endpoint; close/publish/open are its supported lifecycle. Event
creation/edit metadata is regional-only on the existing API, so HQ uses the web dashboard for editing.

## Final parity verification

The screen/API audit above covers the Expo destinations, with Phase 5 business rules applied.
Parity fixes include the complete notification destination map, server error parameters and loyalty
error keys, attendance/unread summaries, member-friendly physical card status, KTM content/spacing,
native calendar/time dialog colors and locale, permission rechecks after returning from settings,
and a new scan after a rejected/expired QR. Pull-to-refresh reloads the visible screen's REST queries
and the current profile/capabilities, including recovery from an initial offline profile fetch.
PR forms disappear when the server removes PR access. The wheel renders all five names and aligns
the saved winner under the top pointer; a JVM test checks every possible winner position.

Realtime reconnects with newly fetched credentials, observes room access deadlines and clears content
after access loss or forbidden REST responses. A native network interruption test disabled and then
restored only Pixel_10_Pro's Wi-Fi/data; the room rejoined and displayed its connected state again.
Social video now plays inline on a TextureView, so channel FLAG_SECURE protection stays active;
playback cache files are removed on completion/disposal. The normal channel capture test produced
a black application window, while debug capture allowed the required visual review.

Additional dev-server checks: the CameraX analyzer decoded a live QR shown by the emulator's virtual
scene, previewed Fajar Nugroho and confirmed his APP_QR attendance; expired QR retry was exercised.
All five demo members obtained real server draw entries, spending server-authorized XP; the native HQ
run saved Citra Maharani as winner. HQ posted/pinned a timeline item and reacted to it through native
controls. Native channel creation/editing was inspected; a nullable posting policy preserves the city
default when editing. The regional recap saved PIC/accountable fields through native controls. Public card links
showed Bima's pending card profile and the own-card shortcut. Native pull-to-refresh picked up a temporary
PR flag and exposed the PR claim form; the original flag was restored afterward.

Screenshots were captured and opened for visual inspection under
`C:/Users/Berlin/Documents/Dev/pats-shots/4-*.png`: every member destination, regional editor and HQ admin
destinations in Indonesian/dark mode at approximately 359 dp width; English/light baselines are in
Phases 1–3. Final compact/large-text captures cover the corrected floor-plan labels, full navigation
labels and card QR. Emulator-only density/font/night overrides were restored after those checks.
JVM results: foundation 4, member logic 3, admin validation 2, NFC 5, QR 1 and parity 3; zero failures.
`testDebugUnitTest assembleDebug` passes with the documented debug DNS override. Shared-copy audit
checks 333 literal keys. APK: `apps/android/app/build/outputs/apk/debug/app-debug.apk`.

Review remains open: the owner sent the Phase 3 review heading twice without a notes body. A request
for the missing notes is pending. No final completion marker is written until those notes are received
and addressed. Physical NFC, deployment origin and release/push setup remain the owner tasks above.
