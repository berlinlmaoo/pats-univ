# Android KTM design round — 18 October 2026

Implementation: `feat/android-native`, native Kotlin / Jetpack Compose in `apps/android`.
Merged `vm/dev` as `9477175`; review fix `8a2d003` remains an ancestor. Local API configuration,
capability/no-access handling, and idempotent chat client IDs are retained.

## Delivered

- The shared paper/navy-night palette, 4/6/10 radii, Figtree variable weights 400–900,
  Graduate headings with the shared outline/tracking, label caps, tabular figures, navy bands,
  gold rules, maroon card actions, skeletons and recovery states.
- Official full-crest launcher/adaptive/splash artwork, with no monochrome substitute or shield
  cutout. Android resources are generated at build time from the approved repository assets.
- The official KTM front/back, exact shared geometry, black live name/drink/genre values,
  white EC-M QR modules with no added quiet zone inside the printed maroon tile, rotating
  check-in tokens, gold countdown progress, enlargement, flip and accessibility descriptions.
  NIM, song and quote are below the artwork; physical status is a separate badge.
- `card-value.ttf` comes from **one source**, `packages/shared/assets/fonts/card-value.ttf`.
  The generated Android resource has the same SHA-256:
  `D32CF04815985F3CB0FA811236A1E130DB44885EA981927A3237427320E851EF`.
- Home · Events · KTM · Hub · Profile navigation, gold active indicators, maroon KTM well,
  shared segmented tabs, Pending/History claims, pending count chips, leaderboard rank chips,
  period/reset line, event badges/check-in strip, selected-channel restoration/highlighting,
  rupiah revenue inputs and result-only ended draws. Tab labels fit their available width at
  enlarged system text sizes while retaining their full accessible text.
- Profile drink/genre/song/quote editing, photo camera/library entry points, square crop/zoom,
  matching type/5 MB/400–8000 px checks, and authenticated `PUT /api/me/photo`.
  Name stays read-only, matching the web API. Join remains on the web and includes drink/photo.
- The login join link derives `/join` from the selected API origin. OTP uses one real input
  with six visual boxes, Android OTP autofill semantics and auto-submit.
- Public digital ID uses the KTM front/back, status, city, member-since and signed photo.
  It never renders NIM, email, phone, song or quote, including when viewing your own card.

## Validation

`gradlew.bat testDebugUnitTest assembleDebug` passes: **21 tests, zero failures**.
The added tests cover profile/photo boundaries and inverted QR decoding at full and 30%
luminance. Camera decoding now tries normal/inverted luminance and adaptive/global thresholding.
The existing auth, NFC interruption/recovery, validation, draw and parity tests remain green.
The shared-copy audit checks **344 literal keys** in both languages.

Device: **Pixel_10_Pro**, visible window, `-gpu host`, PATS dev at
`https://pats-univ.tail765d02.ts.net`. The main matrix uses density 570 on its 1280 px display
(approximately **359 dp**), with ID/EN and light/dark. HQ and regional accounts exercise their
actual permissions; regional captures replace HQ's denied event-editor views.
After verification, display density was restored to 480, font scale to 1.0 and night mode to
automatic. Wi-Fi/data were enabled again, and the Pixel_10_Pro emulator was shut down.

Actual dev interactions verified:

- Demo OTP login and auto-submit for member/HQ/regional accounts. The pending verification
  state and resend cooldown now survive activity recreation; the auth matrix switches theme
  while the same code remains pending and then verifies entry into the authenticated shell.
- Favorite drink changed to “Iced tea” through the native form, confirmed through `/api/me`
  and on the live KTM, then restored to “Soju”.
- Camera capture → square crop → upload → signed JPEG read, with HTTP 200 and the stored photo
  shown in the profile. The demo photo is the emulator camera scene, not a real member portrait.
  The system library picker also opens the selected local photo in the square crop UI. Large
  inputs are sampled before preview decoding, and zoom/crop output cannot fall below 400 px.
- Public card API fields and native screen content checked for private-field exclusion in
  all four language/theme combinations. The temporary card-station lookup lease used to obtain
  its public URL was released; no NFC encode or card lifecycle change was performed.
- Empty draw shows five outlined slots; an ended draw shows its result/no-draw summary without
  entry controls or a wheel. Network interruption retains the KTM identity without a usable
  live QR; the emulator's original Wi-Fi/data settings were restored afterward.
- Large text (1.4×) covers KTM, profile, reservation and hub in EN/light and ID/dark. The clipped
  “Beranda” label found on the first pass is corrected in the refreshed `large-*` captures.
- Launcher and cold splash captures show the full crest in light/dark. These art-only screens
  have no language-dependent content.

## Evidence

Screenshot gallery and original PNGs:
`C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/index.html`.
The gallery contains **226 PNGs**, including the 180-image matrix below.
Each matrix filename is `{role}-{en|id}-{light|dark}-{screen}.png`; main-route XML captures sit beside them.
Contact sheets are `{role}-{language}-{scheme}-contact-*.jpg`.
Interaction screenshots show profile editing, live KTM updates, camera/crop/upload and extra checks.
Screenshots were opened individually and as contact sheets; tab indicator and typography issues
found during inspection were corrected and the affected views recaptured.

APK: `apps/android/app/build/outputs/apk/debug/app-debug.apk`.
SHA-256: `E4D63973B0451E4725215AACF43F792BC0B6505CAEB1E41E9093B0F414119B35`.
Reproduction helpers: `design-matrix.mjs`, `design-public.mjs`, `design-auth.mjs`,
`QrImage.java` (including dimmed on-tile posters) and `design-gallery.ps1` under `apps/android/scripts`.
They use an existing authenticated debug session; they do not bypass server authorization.

## Acceptance limits and web differences

- **Physical optical acceptance remains open:** JVM luminance tests do not establish
  scanning from 30 cm at 30% real display brightness. Test the in-card and enlarged QR with a
  physical crew phone in both themes. Physical NFC still needs Berlin's Android phone and
  NTAG213/215/216 cards.
  An additional virtual-scene camera attempt did not reach a member preview because the poster
  was not framed successfully; it is not recorded as a passing end-to-end camera test. The
  poster and exploratory `camera-search-*.png` captures remain in the evidence directory.
- **The original example overlay remains unverified:** the master `example-front.png` is not
  in this workspace, and read-only SSH access to its documented host failed host-key verification.
  Android uses the shared measured coordinates, approved blank artwork and
  identical value font, but this report does not claim the original-master 1%-width comparison.
- The existing wallet API supplies balance and reward milestone/progress, with no membership
  level field or level thresholds. Home shows those server values without inventing a level.
- Scan/handover/member-card responses expose signed photos. Reward-validation and claim-review
  responses do not supply a photo, so those screens retain the identity data supplied by the
  current web API.
- Android uses native pickers, camera/photo picker, alerts and Compose animation equivalents of
  the Expo-specific prescriptions. Dates are displayed day-first and time inputs use 24-hour
  dot-separated time with the city zone. No new backend or FCM provider was introduced.
- FCM credentials/server support, release signing/Play setup and physical NFC remain the owner
  tasks documented in [ANDROID-NATIVE.md](ANDROID-NATIVE.md).

## Screenshot inventory

180 matrix screenshots across 45 screen/state rows; additional interaction, branding and large-text captures are in the gallery.

| Screen / state | EN light | ID light | EN dark | ID dark |
|---|---|---|---|---|
| admin / claims | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-light-claims.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-light-claims.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-dark-claims.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-dark-claims.png) |
| admin / codes | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-light-codes.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-light-codes.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-dark-codes.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-dark-codes.png) |
| admin / community | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-light-community.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-light-community.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-dark-community.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-dark-community.png) |
| admin / create | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-light-create.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-light-create.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-dark-create.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-dark-create.png) |
| admin / crew | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-light-crew.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-light-crew.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-dark-crew.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-dark-crew.png) |
| admin / edit | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-light-edit.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-light-edit.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-dark-edit.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-dark-edit.png) |
| admin / encode | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-light-encode.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-light-encode.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-dark-encode.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-dark-encode.png) |
| admin / event | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-light-event.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-light-event.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-dark-event.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-dark-event.png) |
| admin / events | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-light-events.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-light-events.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-dark-events.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-dark-events.png) |
| admin / handover | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-light-handover.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-light-handover.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-dark-handover.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-dark-handover.png) |
| admin / hub | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-light-hub.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-light-hub.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-dark-hub.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-dark-hub.png) |
| admin / manual | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-light-manual.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-light-manual.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-dark-manual.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-dark-manual.png) |
| admin / member | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-light-member.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-light-member.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-dark-member.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-dark-member.png) |
| admin / members | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-light-members.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-light-members.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-dark-members.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-dark-members.png) |
| admin / operations | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-light-operations.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-light-operations.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-dark-operations.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-dark-operations.png) |
| admin / profile | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-light-profile.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-light-profile.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-dark-profile.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-dark-profile.png) |
| admin / scan | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-light-scan.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-light-scan.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-dark-scan.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-dark-scan.png) |
| admin / scanner | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-light-scanner.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-light-scanner.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-dark-scanner.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-dark-scanner.png) |
| admin / station | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-light-station.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-light-station.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-dark-station.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-dark-station.png) |
| admin / tools | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-light-tools.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-light-tools.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-en-dark-tools.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/admin-id-dark-tools.png) |
| auth / login | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/auth-en-light-login.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/auth-id-light-login.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/auth-en-dark-login.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/auth-id-dark-login.png) |
| auth / verify | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/auth-en-light-verify.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/auth-id-light-verify.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/auth-en-dark-verify.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/auth-id-dark-verify.png) |
| member / card | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-light-card.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-light-card.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-dark-card.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-dark-card.png) |
| member / card-back | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-light-card-back.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-light-card-back.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-dark-card-back.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-dark-card-back.png) |
| member / chat | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-light-chat.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-light-chat.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-dark-chat.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-dark-chat.png) |
| member / claims | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-light-claims.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-light-claims.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-dark-claims.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-dark-claims.png) |
| member / draw | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-light-draw.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-light-draw.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-dark-draw.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-dark-draw.png) |
| member / event | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-light-event.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-light-event.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-dark-event.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-dark-event.png) |
| member / events | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-light-events.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-light-events.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-dark-events.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-dark-events.png) |
| member / history | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-light-history.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-light-history.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-dark-history.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-dark-history.png) |
| member / home | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-light-home.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-light-home.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-dark-home.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-dark-home.png) |
| member / hub | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-light-hub.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-light-hub.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-dark-hub.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-dark-hub.png) |
| member / leaderboard | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-light-leaderboard.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-light-leaderboard.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-dark-leaderboard.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-dark-leaderboard.png) |
| member / notifications | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-light-notifications.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-light-notifications.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-dark-notifications.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-dark-notifications.png) |
| member / preferences | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-light-preferences.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-light-preferences.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-dark-preferences.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-dark-preferences.png) |
| member / profile | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-light-profile.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-light-profile.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-dark-profile.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-dark-profile.png) |
| member / promoter | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-light-promoter.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-light-promoter.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-dark-promoter.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-dark-promoter.png) |
| member / region | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-light-region.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-light-region.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-dark-region.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-dark-region.png) |
| member / reservation | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-light-reservation.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-light-reservation.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-dark-reservation.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-dark-reservation.png) |
| member / reservations | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-light-reservations.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-light-reservations.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-dark-reservations.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-dark-reservations.png) |
| member / rewards | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-light-rewards.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-light-rewards.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-dark-rewards.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-dark-rewards.png) |
| member / roaming | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-light-roaming.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-light-roaming.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-dark-roaming.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-dark-roaming.png) |
| member / timeline | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-light-timeline.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-light-timeline.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-en-dark-timeline.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/member-id-dark-timeline.png) |
| public / card | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/public-en-light-card.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/public-id-light-card.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/public-en-dark-card.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/public-id-dark-card.png) |
| public / card-back | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/public-en-light-card-back.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/public-id-light-card-back.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/public-en-dark-card-back.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/design-18oct/public-id-dark-card-back.png) |

