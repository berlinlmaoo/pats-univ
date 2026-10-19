# Android owner QA — 19 October 2026

Branch: `feat/android-qa-19oct`, based on bundled dev `e7ac3c5`.
The earlier configuration/no-access/chat fixes and Avenir update are retained.
**Status: live QA is blocked by the dev peer going offline. This report is a checkpoint,
not a claim that the full owner tour or cleanup is complete.**

## Environment and method

- Native Kotlin/Compose app against `https://pats-univ.tail765d02.ts.net`.
- Pixel_10_Pro, visible window, host GPU, port 5554, 1536 MB guest RAM.
  The owner's updated instruction permits this separate emulator. NEXUS on port 5556
  is left untouched. Free physical RAM is monitored; PATS idle build processes were stopped
  and its emulator working set trimmed to preserve headroom above 3 GB.
- Main matrix: approximately 359 dp (1280 px at density 570), EN/ID × light/dark.
  Both initial and scrolled content are captured. Real demo OTP sessions and current UUID
  server IDs are used; server permissions remain authoritative.
- Screenshots, UI XML, contact sheets and gallery:
  `C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/index.html`.
  Filenames identify role, language, scheme and screen; `-details` captures lower content.
- iOS comparison is a source/API/behavior audit of `apps/ios`, not an iPhone visual run.
  Its own report still requires device acceptance. Web source and deployed dev are the
  other references. No UI taste changes are applied beyond the approved design.

## Defects fixed

| Defect | Change | Commit / verification |
|---|---|---|
| Long KTM values kept shrinking onto one line, unlike web/iOS | Use the same 0.6 wrap threshold, 0.42 minimum scale and 1.04 line advance; preserve the first cap top and embedded Avenir tracking | `2e0be8a`; two fit-boundary tests; native 40/50-character saves confirmed by API and two-line card captures in EN/light and ID/dark |
| A completed NFC write's failed server report existed only in Compose memory | Encrypt and persist the pending report in no-backup storage; isolate by account/server; restore on returning to encoding; remove after successful report | `4788114`; restart/isolation/clear test; actual tag write needs hardware |
| QA channel routes still used pre-migration IDs and copy audit only checked English | Read current fixture UUIDs, capture scrolled states, refresh shared copy, check both dictionaries including native/KTM/auth keys | `f44d471`; 390 literal keys verified per language |
| Member claim rows omitted saved notes and private receipt viewing, available on iOS | Display notes and fetch the owner-authorized signed receipt URL with local error/retry feedback | `8c8f214`; build green; live receipt check awaits dev recovery |
| The City leaderboard opened in alphabetically first Bandung for a Jakarta member | Start in the home city, separate scope from the chosen city, preserve the choice when switching National/City | `8c8f214`; before-fix device evidence shows Bandung; corrected live recheck awaits dev recovery |
| The screenshot helper could count request-error views as successful tour captures | Retry request/pull-to-refresh recovery, fail on persistent errors, allow targeted recapture | `62adaa2`; an initial outage's affected ID/dark views were successfully recaptured after recovery |

## Screen results

The member matrix contains **164 PNGs** (initial/scrolled views and the KTM back) across all
four language/theme combinations. Public-card front/back adds **8 PNGs**. Contact sheets were
visually inspected. The gallery currently contains **212 PNGs**, including interaction,
login, large-text, recovery and branding evidence. Baseline captures precede the final two loyalty
fixes; those specific live checks remain open below.

| Screen / state | Current result |
|---|---|
| Member Home | Four modes: next event, XP, maroon KTM shortcut and lower navigation visible |
| KTM front/back/flip | Four modes: official art/Avenir, white tile QR, status outside art, NIM/song/quote below; no member NFC reader action |
| Enlarge QR | Four modes: opens white-on-maroon and closes successfully |
| Events | Four modes; national toggle additionally exercised |
| Event detail | Four modes: day-first 24-hour WIB, event badge and booking/roaming/draw links |
| Wallet/rewards | Four modes: balance, catalogue/availability and ledger; no prizes redeemed |
| Leaderboard | Four-mode baseline and scope interaction; home-city correction needs live recheck |
| Claims / promoter alias | Four-mode baseline, History tab exercised; newly restored receipt/notes need live recheck |
| Draw | Four modes: five outlined empty slots, unavailable entry disabled; no XP spent |
| Attendance history | Four modes: event/date/method rows |
| Region change | Four modes: validation/disabled submission; no region change submitted |
| Roaming | Four modes: event/type/review controls; no access grant requested |
| Hub / timeline / chat | Four modes: live connection/feed and composer; a typed draft/keyboard checked and cleared without sending a chat message |
| Reservations / community operations | Four-mode forms and empty state; native S1 reservation persisted as PENDING and opened its conversation; cleanup awaits dev recovery |
| Notifications / preferences | Four modes: list/deep-link buttons and preference controls; persisted notification bodies retain their creation language |
| Profile / account | Four modes, native max-length drink/genre save, signed photo display and lower account controls; original fields restored |
| Photo camera / library | Camera → crop → upload → signed JPEG HTTP 200; original image content restored by PUT HTTP 200. Library selection reaches crop; cancelled without upload |
| Public digital ID front/back | Four modes: private NIM/email/phone/song/quote exclusion checks pass |
| Offline KTM | Identity retained with no usable QR; localized recovery states; large-text card/profile captures at 1.4× in EN/light and ID/dark |
| Launcher / cold splash | Full crest visible in both schemes; clear splash captures use Android's no-animation launch flag to avoid capturing the window transition |
| Logout / login | Native logout succeeds while offline; login layouts captured in all four modes |
| OTP / web join | OTP and live enrolment pending dev recovery. Join launches Chrome with the selected dev origin (confirmed in ActivityTaskManager); Chrome stops at its first-run terms/account screen. No terms/account setup was accepted. Web's forced-light enrolment source audited |
| Regional/HQ scan, manual preview/check-in, camera permission, handover, member-card search/detail, encode/station, events/editor/attendance, claims review, reward validation, operations, admin hub/profile | Current-round device tour pending dev recovery; source/API comparison completed. No physical tag result claimed |

Dev became unreachable again after the reservation test. Tailscale reports the `pats-univ`
peer **offline**, last seen **19 Oct 2026 at 11:40 Bangkok** (`04:40Z`). Windows requests
also time out. The owner has been asked to restore it. The remaining admin/auth/join checks,
two loyalty rechecks and test-reservation cleanup must not be represented as passed.

## Build and regression checks

`testDebugUnitTest assembleDebug` passes: **24 tests, zero failures**.
Foundation 4, member logic 3, admin validation 2, NTAG 5, QR 2, parity 3, profile 2,
card fitting 2 and pending encode storage 1. No physical NFC operation is represented by
the fake-tag or storage tests.

Latest APK: `apps/android/app/build/outputs/apk/debug/app-debug.apk`.
SHA-256: `A61D975BD36D81E981970EBDB85B558EFA58919FAA13758E7DC5D1FA69232507`.
The actual APK font entry matches the shared Avenir SHA-256
`897AF4EB430E2F6BA18BA7FBB72FBB8A7CDC6663729C60E7A707C05D81E29A6B`.
No AndroidRuntime fatal exception was logged during this tour.

## Acceptance boundaries

- Android's member KTM contains no NFC reader action. NFC read/encode actions remain in
  crew tools, matching the owner decision and iOS member screen.
- The official blank front/back and full crest remain unchanged. The unchanged commercial
  Avenir file is bundled from the shared private-repository source; no public upload or new
  font copy is introduced.
- The original `example-front.png` is still unavailable locally. Read-only SSH access to its
  documented location fails host-key verification. The requested original-master 1% overlay
  is **unverified**; measured shared tokens and matching font bytes do not prove that result.
- Berlin's phone and NTAG213/215/216 cards are needed for physical NFC check-in, handover,
  encode/protection/re-encode and an interrupted-write/report-recovery run.
- A real crew camera and member display are needed for white-on-maroon scans from 30 cm at
  30% brightness in both themes, including enlarged QR. Emulator/JVM checks do not establish
  that optical acceptance. Real camera/gallery permissions, EXIF/crop and face matching should
  also be checked on the owner's phone.
- Spoken TalkBack, physical hit-target usability and release icon masking remain device checks;
  UI semantics and emulator images are narrower evidence.

## QA data and handoff

One dedicated dev event, `Android QA 19 Oct 2026`, was created and opened for this tour.
Demo profile values and original photo were saved locally before interaction tests so they
could be restored; both are restored on the server. A reservation for Bima, event
`PATS University Launch Night`, slot **S1**, pax **2**, note
`Owner Android QA - cancel after test`, remains **PENDING** because dev went offline.
Reservation ID: `01a15274-cf24-73c7-aaf6-04921c090e3a`, also saved in the ignored local
`.qa/qa-booking.json`; cancel it when the server returns. No chat message or prize award was sent. Receipt-claim fixture creation was attempted
after the outage and did not return a success; check for the note
`Owner Android QA private receipt check` before creating another fixture.

Pixel_10_Pro is shut down. Density is restored to 480, font scale to 1.0 and night mode to
automatic; the temporary picker image was removed. `adb devices` confirms only NEXUS's
emulator-5556 remains. PATS is signed out after the logout/login-layout checks.

Checkpoint handoff: `C:/Users/Berlin/pats-android-qa.bundle`, containing
`vm/dev..feat/android-qa-19oct`. The bundle is created and verified after this report commit.
It contains the fixes and incomplete-QA record; it is not full-tour approval. Resume with
real demo OTP login when dev is online, complete the regional/HQ and join tour, recheck the
two loyalty fixes, cancel the reservation and regenerate the bundle after closure.

## Screenshot index

Baseline and scrolled captures; see the status table above for live rechecks still required.

| Screen / state | EN light | ID light | EN dark | ID dark |
|---|---|---|---|---|
| auth / login | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/auth-en-light-login.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/auth-id-light-login.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/auth-en-dark-login.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/auth-id-dark-login.png) |
| member / card | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-card.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-card.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-card.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-card.png) |
| member / card-back | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-card-back.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-card-back.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-card-back.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-card-back.png) |
| member / card-details | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-card-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-card-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-card-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-card-details.png) |
| member / chat | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-chat.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-chat.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-chat.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-chat.png) |
| member / chat-details | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-chat-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-chat-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-chat-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-chat-details.png) |
| member / claims | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-claims.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-claims.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-claims.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-claims.png) |
| member / claims-details | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-claims-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-claims-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-claims-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-claims-details.png) |
| member / draw | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-draw.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-draw.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-draw.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-draw.png) |
| member / draw-details | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-draw-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-draw-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-draw-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-draw-details.png) |
| member / event | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-event.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-event.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-event.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-event.png) |
| member / event-details | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-event-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-event-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-event-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-event-details.png) |
| member / events | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-events.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-events.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-events.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-events.png) |
| member / events-details | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-events-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-events-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-events-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-events-details.png) |
| member / history | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-history.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-history.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-history.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-history.png) |
| member / history-details | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-history-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-history-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-history-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-history-details.png) |
| member / home | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-home.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-home.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-home.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-home.png) |
| member / home-details | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-home-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-home-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-home-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-home-details.png) |
| member / hub | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-hub.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-hub.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-hub.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-hub.png) |
| member / hub-details | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-hub-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-hub-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-hub-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-hub-details.png) |
| member / leaderboard | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-leaderboard.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-leaderboard.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-leaderboard.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-leaderboard.png) |
| member / leaderboard-details | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-leaderboard-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-leaderboard-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-leaderboard-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-leaderboard-details.png) |
| member / notifications | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-notifications.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-notifications.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-notifications.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-notifications.png) |
| member / notifications-details | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-notifications-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-notifications-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-notifications-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-notifications-details.png) |
| member / preferences | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-preferences.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-preferences.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-preferences.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-preferences.png) |
| member / preferences-details | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-preferences-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-preferences-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-preferences-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-preferences-details.png) |
| member / profile | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-profile.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-profile.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-profile.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-profile.png) |
| member / profile-details | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-profile-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-profile-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-profile-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-profile-details.png) |
| member / promoter | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-promoter.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-promoter.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-promoter.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-promoter.png) |
| member / promoter-details | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-promoter-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-promoter-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-promoter-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-promoter-details.png) |
| member / region | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-region.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-region.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-region.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-region.png) |
| member / region-details | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-region-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-region-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-region-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-region-details.png) |
| member / reservation | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-reservation.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-reservation.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-reservation.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-reservation.png) |
| member / reservation-details | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-reservation-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-reservation-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-reservation-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-reservation-details.png) |
| member / reservations | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-reservations.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-reservations.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-reservations.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-reservations.png) |
| member / reservations-details | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-reservations-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-reservations-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-reservations-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-reservations-details.png) |
| member / rewards | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-rewards.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-rewards.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-rewards.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-rewards.png) |
| member / rewards-details | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-rewards-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-rewards-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-rewards-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-rewards-details.png) |
| member / roaming | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-roaming.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-roaming.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-roaming.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-roaming.png) |
| member / roaming-details | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-roaming-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-roaming-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-roaming-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-roaming-details.png) |
| member / timeline | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-timeline.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-timeline.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-timeline.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-timeline.png) |
| member / timeline-details | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-timeline-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-timeline-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-timeline-details.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-timeline-details.png) |
| public / card | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/public-en-light-card.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/public-id-light-card.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/public-en-dark-card.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/public-id-dark-card.png) |
| public / card-back | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/public-en-light-card-back.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/public-id-light-card-back.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/public-en-dark-card-back.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/public-id-dark-card-back.png) |
