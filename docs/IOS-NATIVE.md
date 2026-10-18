# PATS University native iOS

19 October 2026. SwiftUI in `apps/ios`, bundle `id.znetworks.patsuniv`, team `5YR5T42G97`.
`project.yml` is the XcodeGen source of truth. Approved backend/shared/Expo design changes arrived
via `vm/dev`; this round adds native iOS consumption and shared bilingual copy.

## Status

- Foundation: XcodeGen, KTM palette and official full crest, Figtree/Graduate/card-value fonts, EN/ID shared dictionaries,
  duplicate-key/locale parity build check, OTP including demo code and resend cooldown,
  Keychain session cache, serialized refresh-token rotation, theme/language settings,
  member/admin capability detection, public `/c/<token>` links, native push delegate,
  Socket.IO v4 over URLSession WebSocket following NEXUS's dependency-free approach.
- Member screens: implemented and compile checked; camera, media and live service/device QA pending.
- Admin screens and NFC: implemented and compile checked; 28 macOS SwiftPM tests pass.
- Static parity audit: complete against `pc/android-native` at `282ac2f` and the Expo sources. Device/visual QA remains pending; no simulator or app has been launched.

## Build without running

```sh
cd apps/ios
node scripts/sync-shared.mjs
xcodegen generate
pgrep -x xcodebuild # wait if any build is already running
df -h /            # at least 6 GB available
xcodebuild -scheme PATS -destination 'generic/platform=iOS Simulator' -jobs 2 -derivedDataPath ~/dd-pats-ios build
```

No simulator/emulator is booted and no app is launched. Compile-only validation does not prove UI,
authentication against the live service, camera, push, NFC, universal links or background behavior.

Debug reads the development origin from `~/.config/pats/ios-dev-server-url` during the post-build
phase before signing. The only committed development origin is `https://pats-dev.invalid`.
Release uses `https://patsuniv.znetworks.id`. Generated projects, credentials and build products
are ignored. Never copy a built Info.plist into Git.

## Screen/API map

| Screen/service | API |
|---|---|
| OTP request / verify | POST `/api/auth/otp/request`, `/api/auth/otp/verify` |
| Session / profile | POST `/api/auth/refresh`, `/api/auth/logout`; GET/PATCH `/api/me` |
| Public card | GET `/api/c/:token` (optional bearer) |
| Realtime | GET `/api/social/token`; Socket.IO websocket auth `{token}`, room `join`, `message`, `changed`, `access_lost` |

## Member and crew screen/API inventory

| Screens | Contract |
|---|---|
| Member card, rotating QR | GET `/api/me/card-token`; server clock offset, expiry hiding, foreground wake lock |
| Events, cross-city events, detail/flyer | GET `/api/events?scope=all`, `/api/events/:id`, API-provided flyer URL |
| History | GET `/api/me/check-ins` |
| Wallet, milestones, catalogue, codes/countdowns, ledger, expiry | GET `/api/loyalty/wallet`; POST `/api/loyalty/redeem` `{eventId,rewardId}`; private wallet room |
| Leaderboard | GET `/api/loyalty/leaderboard?cityId=&month=&eventId=`; server mode/period and self rank |
| Member/PR claims, pending edits | GET/POST/PATCH `/api/loyalty/claims`; server form eligibility, optional receipt |
| Camera receipt | POST `/api/loyalty/receipt-upload`; PUT JPEG to signed URL; 5 MB limit |
| Event prize draw | GET `/api/loyalty/draw?eventId=`; POST `/api/loyalty/spin`; POST `/api/admin/draw` `{eventId,action:"run"}`; draw room, server winner and free credit |
| Region requests | GET/POST `/api/me/region-change`; pending request and HQ decision note |
| Membership exit | POST `/api/me/leave`; centred alert, then local session removal |
| Hub / channel / private conversation | GET `/api/social/hub`, `/api/social/feed?kind=&id=&cursor=`; POST `/api/social/messages` (`clientId` per draft, reused on retry, same as Android), `/api/social/posts`; socket message acknowledgement |
| Community camera, video, voice / playback | POST `/api/social/upload` `{room,contentType}`; bounded signed PUT; native JPEG, AAC/M4A and MP4 capture and AVPlayer |
| Channel editor / moderation / reactions | POST `/api/social/channels`, `/api/social/moderate`, `/api/social/react`; HQ timeline posting, server policy and archived state |
| Screenshot reporting | POST `/api/social/screenshot` `{channelId,platform:"IOS"}`; hide captured channel, screenshot notification observer |
| Reservation floor plan and accessible selector | GET `/api/social/slots?eventId=`; POST `/api/social/reserve` `{eventId,slotCode,pax,note}`; opens private conversation |
| Roaming | POST `/api/social/roaming` `{eventId,type}` |
| Community operations / decisions | GET `/api/social/operations`; POST `/api/social/reservation-decision`, `/api/social/roaming-decision`; status, expiry, moderation and screenshot counts |
| Notifications / settings | GET `/api/me/notifications`; POST `/api/me/notifications/read` `{all:true}`; GET/PATCH `/api/me/notification-prefs` |
| Admin tools / event picker / detail / attendance | GET `/api/admin/events`, `/api/admin/events/:id`, `/api/admin/events/:id/attendance`; attendance room |
| Regional event editor / lifecycle | GET `/api/admin/event-form`; POST `/api/admin/events`, PATCH `/api/admin/events/:id`; POST `/api/admin/events/:id/actions` `{action:publish/open/close}` |
| NFC, camera QR, manual check-in | POST `/api/admin/check-in/preview`, `/api/admin/check-in`; GET `/api/admin/events/:id/members?q=`; identity, issue/capacity/roaming and ticket expiry, mandatory manual reason |
| Handover | POST `/api/admin/cards/handover/preview`, `/api/admin/cards/handover`; real tag token+UID and explicit identity alert |
| Member card search / detail / revoke / re-encode | GET `/api/admin/cards/members?q=`, `/api/admin/cards/members/:id`; POST `/api/admin/cards/:id/revoke`, `/api/admin/cards/:id/reencode-requests`; approved personal grant links to encoder |
| Encoding batches / lookup / phone station | GET `/api/hq/batches`; POST `/api/hq/cards/prepare`, `/api/hq/cards/:id/key`, `/api/hq/cards/:id/encoded`, `/api/hq/cards/:id/release` |
| Reward validation | POST `/api/admin/loyalty/codes/preview`, `/api/admin/loyalty/codes/fulfill`; event and six-character code/QR, identity confirmation |
| Claim review / private receipt | GET/POST `/api/admin/loyalty/claims`; GET `/api/loyalty/claims/:id/receipt?format=json`; adjust counts, approve or reject with reason |
| City operations / recap / promoter controls | GET `/api/admin/loyalty/operations`; POST `/api/admin/loyalty/recaps`, `/api/admin/loyalty/promoters/:id` |
| Historical PR receipts and payouts | Read-only operations reports; GET `/api/loyalty/receipts/:id?format=json`; new submissions use Claim XP |

## NFC implementation and verification

`CardReader` separates physical reading/encoding from workflows; `TagIO` separates raw commands
from the Foundation-only encoder. `CoreNFCCardReader` uses `NFCTagReaderSession` and
`NFCMiFareTag.sendMiFareCommand`; the NDEF-only public-card reader uses `NFCNDEFReaderSession`.
Core NFC cannot run on a simulator. No physical card was written during development.

The encoder preserves factory control TLVs, uses empty/body/header write ordering, checks readback,
keeps PWD/PACK transient, proves PACK with staged AUTH0 before protecting page 4, and never writes
CC or static/dynamic lock pages. Failed hardware writes release the lease. A successful hardware
write is stored as a user/origin-scoped pending report in Keychain; retry submits `/encoded` without
opening an NFC session. The station identifier is random per installation, stored in Keychain.

`swift test --package-path apps/ios --build-system native --jobs 2` runs on macOS without a simulator. The fake tag checks
all three chip types, exact shared station fixtures, interruption at every command followed by
recovery, wrong passwords/PACK, readback failure, lock bits, malformed NDEF lengths, QR clock skew,
card links/query escaping, and Socket.IO handshake/heartbeat/events/acknowledgements.

## Parity audit and remaining gaps

There are 39 Expo routes excluding the eight layout files (47 files in the route tree).
Every non-layout route has a native destination; reusable views keep aliases on the same flow.
The Android reference is the remote-tracking branch read locally, without changing or fetching it.

| Expo route group | Native counterpart |
|---|---|
| `index`, auth `login` / `verify` | `RootView`, two states of `LoginView` |
| `/c/:token` | `PublicCardView`; optional bearer, restricted server response, own-card navigation |
| Member tabs `card`, `events`, `rewards`, `hub`, `profile` | `MemberCardView`, `EventsView`, `WalletView`, `SocialHubView`, `ProfileView` |
| Member `event/:id`, `history`, `leaderboard`, `region-change` | `EventDetailView`, `HistoryView`, `LeaderboardView`, `RegionChangeView` |
| Member `claims`, `promoter` | `ClaimsView`, including server-eligible MEMBER/PR forms and pending edits |
| Shared `social-hub`, `social-channel`, `social-operations` | `SocialHubView`, `ChannelView` (channel or private conversation), `SocialOperationsView` |
| Shared `roaming`, `reservation`, `notifications`, `notification-settings` | `RoamingView`, `ReservationView`, `NotificationsView`, `NotificationSettingsView` |
| Admin tabs `tools`, `account` | `AdminToolsView`, shared `ProfileView` |
| Admin `scan`, `scan/:eventId`, `scan/:eventId/manual` | `ScanEventPicker`, `ScanView`, `ManualCheckInView` |
| Admin `city-events`, `new`, `:id`, `:id/edit` | `EventsView(admin:true)`, `EventEditor`, `EventDetailView(admin:true)`, `EventEditor(eventID:)` |
| Admin `member-cards`, `member-cards/:id`, `handover` | `MemberCardsView`, `MemberCardsDetail`, `HandoverView` |
| Admin `encode`, `encode/run` | `EncodingBatchesView`, `EncodeView` / `EncodeStation` (HQ batch, any card, or approved personal grant) |
| Admin `reward-validation`, `claims-review`, `operations` | `RewardValidationView`, `ClaimsReviewView`, `CrewOperationsView` |

Behavioral checks from source: server capabilities drive the member/crew shell and tools; the
legacy LOCAL_ADMIN alias uses the server's capability list; native alerts confirm consequential
actions; event forms send local city wall-clock fields and leave overnight conversion to the server;
claims edit only pending entries; venue filters and reward codes use server state; draw slots and
winner come from the server, including quarterly free credit. Five outlined draw slots present the
saved winner. QR validity uses server time and conservatively deducts request transit.

The final pass also checks request/response contracts, static localization references, property-list
syntax, Keychain access class, origin-scoped sessions/reports, release exclusion of development
configuration, screenshot payloads, signed-media paths and the absence of simulator commands.

| Gap / limit | Disposition |
|---|---|
| Native UI, EN/ID × light/dark, small iPhone/iPad, Dynamic Type and keyboard layouts have not been visually exercised | Owner QA; compile success is not visual evidence |
| Live OTP, refresh rotation against the deployed server, concurrent crew actions, camera uploads/playback, socket reconnect/access expiry and notification routing have not been exercised in this app | Owner device/API smoke test; tests here use fake HTTP responses and tag IO |
| NFC adapter, tag removal/cancellation, readback/protection and recovery on Berlin's iPhone | Physical QA with real 213/215/216 tags; no hardware success is fabricated |
| Native push delivery | Backend supports Expo registration/delivery only. APNs permission/registration/delegate are prepared, but direct APNs registration/provider/unregister must be added separately |
| Screenshot prevention on iOS | Platform limit: detection/reporting after a screenshot; screen recording hides the channel. No claim of guaranteed prevention |
| HQ event metadata editor, draw prize/peak configuration, venue layout editor, payment recording, batch/vendor/export tools, reward catalogue settings, HQ region/re-encode approval | Existing web dashboard, matching Android/Expo boundaries. Supported native event lifecycle and approved personal re-encode remain available |
| Editable member profile | Implemented: favorite drink, genre, song and quote use `/api/me` PATCH; square camera/library photo uses `/api/me/photo` PUT. Name/city changes remain crew workflows |
| Event deletion | The backend has no deletion endpoint. Native editing and publish/open/close match the supported API lifecycle |
| Design adaptation | Native SF Symbols and native controls follow the NEXUS iOS pattern; the shared PATS palette, fonts, spacing and bilingual copy are reused |
| Gallery import | Square member-photo import is implemented. Community/receipt capture retains the existing camera workflow; OCR and comprehensive orphan-file cleanup remain outside scope |

## Earlier validation record

- Foundation and full member/admin implementation each compiled for the generic iOS Simulator SDK
  before their respective Berlin commits. No simulator was started and the app was never run.
- **20 macOS tests pass**: 12 encoder/presentation/protocol tests and 8 session tests. Tests cover
  all shared command fixtures, interrupted writes at every command for all three chips, password
  and PACK failures, readback/lock guards, QR clock/transit correction, query escaping, formatting,
  Socket.IO packets, concurrent refresh, network failure, revocation, stale responses, server origin
  isolation and an old unauthorized mutation arriving after another account signs in.
- **1,340 keys per language**, identical EN/ID key sets, no duplicates. Literal UI-key references,
  Info.plist, entitlements and privacy-manifest syntax pass static checks.
- Backend, database, Expo implementation and remote branches are unchanged. No server fixtures,
  accounts, pushes, deployment, simulator screenshots or hardware writes were created.
- Final reliability changes compiled successfully with the required generic iOS Simulator destination,
  two jobs and `~/dd-pats-ios`, after the NEXUS Xcode process exited. There are no app-source
  compiler warnings; Xcode only notes skipped AppIntents metadata because the app has no intents.

## Owner tasks / limits

- Physical NFC tests on Berlin's iPhone with NTAG213/215/216, interrupted encodes, recovery,
  password/PACK checks, parallel stations and handover/check-in remain required.
- Push: existing `/api/me/devices` accepts **Expo tokens only**. Native APNs tokens must never
  be submitted as Expo tokens. Native registration/delegate are implemented; backend APNs
  provider/registration/unregister, credential setup, invalid-token cleanup, delivery and routing
  need a separate backend change authorized by the owner. In-app notifications remain available.
- App Store: provisioning/signing, APNs key outside Git, public AASA with team/bundle ID,
  privacy/legal review, artwork, listing/screenshots and TestFlight/device QA.
- Final HQ artwork/legal and notification copy dependencies in Phase 5 remain outstanding.

IOS-NATIVE DONE (QA pending)


## 19 October 2026 — KTM design round

Merged `vm/dev` through `64069db`, retaining iOS review fixes `6da5eb9`, `d012c05`,
`51176f1`, and `926a086`. Commits use Berlin <bagasputro.bp@gmail.com>.

Implemented:

- Shared light paper / dark navy palettes, Figtree UI, stroked Graduate navigation titles,
  square controls/cards/badges, navy navigation and sheet headers, gold rules, accessible
  empty/error states, skeleton loading, scrollable heavy-caps sub-tabs and danger confirmations.
- Member tabs: Home, Events, KTM, Hub, Profile. The bar is navy in both themes, with a gold
  active indicator and maroon KTM well. Crew Tools shows the pending claims count.
- Home starts with the next event, then live XP/reward milestone progress and a maroon KTM
  shortcut. Rewards remain reachable from Home/Profile. The wallet API supplies a reward
  milestone, not a named level; no client-only level or XP threshold was invented.
- Exact web 1600 px front/back artwork decoded losslessly to PNG at resource import, shared
  fractional geometry, cap-top placement and the
  exact bundled `packages/shared/assets/fonts/card-value.ttf` drawn directly with CoreText.
  The font is read directly from its bytes, avoiding collisions with Figtree's named instances
  and preserving the future licensed-font replacement path. No system Avenir.
- Live white QR inside the maroon tile, error correction M, one filled vector path; gold expiry
  progress, expired/background code removal, plain-maroon enlarged QR. Physical status and
  NIM/song/quote stay below the artwork. Card flip hides backfaces; Reduce Motion crossfades.
- Profile edits drink/genre/song/quote with shared limits, first-invalid-field focus and error
  announcements. Camera/library square crop normalizes to JPEG, 400–1600 px and at most 5 MB;
  authenticated PUT preserves token refresh and stale-session protection. Profile has a QR-free
  KTM thumbnail. Join continues through the selected origin's web flow, including drink/photo.
- Public digital ID shows the card, status, city, member-since and photo; no NIM, contact details,
  song or quote. Crew identity components show the photo first.
- Explicit `dd/MM/yyyy` and `HH.mm` date/time controls with city-zone labels; fixed 24-hour
  wheel locale. Leaderboard city/national tabs, rank chips, period/reset line, tabular XP;
  draw slots and ended-event result summaries; Hub and claims Pending/History sub-tabs.
- Full official LOGO-01 crest assets copied unchanged for the icon and splash. The launch
  storyboard fits a 200 pt full crest on the navy band; the login hero uses the official lockup.
- Launch/foreground `/api/me` refresh replaces and persists migrated user/member IDs and
  remounts the shell if the user ID changes. No CUID-length or prefix assumptions are used.

Verification:

- Compile-only build for the generic iOS Simulator SDK, two jobs, `~/dd-pats-ios`; the script
  waits for existing `xcodebuild` processes. No simulator boot, app launch or UI test run.
- 28 macOS Swift tests pass: existing NFC/session/chat tests plus day-first/24-hour formatting,
  real Vision decoding of the production QR path at 90/230/640 px in both navy-on-white and
  white-on-maroon, persisted UUIDv7 identity replacement, logout races, and authenticated photo
  upload refresh/body-limit behavior.
- 1,505 keys in each language; identical sets, no duplicates and no missing literal UI keys.
  Shared font/artwork copies and property lists checked. Compile success does not establish
  visual layout or hardware scanning acceptance.

Native design §9 device acceptance (still required):

| Criterion | Remaining device QA |
|---|---|
| §9.1 Layout | iPhone 15/16, light/dark × ID/EN, small widths, iPad, keyboard and Dynamic Type |
| §9.2 Card match | Overlay MICHAEL WIBOWO / TEQUILA / HIPHOP, BREAKBEAT against the owner's `example-front.png`; verify positions within 1% of card width |
| §9.3 Scanning | Crew scanner at 30 cm and 30% screen brightness in both themes, including the enlarged QR |
| §9.4 Branding | Installed icon and launch splash show the complete crest without clipping |
| §9.5 Dates | Date/time wheels and labels on devices set to US locale and 12-hour clock; WIB/city-zone round trip |
| §9.6 Accessibility | VoiceOver reads card values/status, first invalid field focus, errors and all touch targets ≥44 pt |

Also smoke-test OTP/restore after UUID migration, profile save, gallery/camera crop and permission
recovery, photo face matching in crew tools, QR refresh/expiry/background, flip with Reduce Motion,
claims counts and tabs, check-in strips, leaderboard periods, ended draws and Hub navigation.
No deployed accounts, real NFC tags, uploads, server state or release settings were changed here.
