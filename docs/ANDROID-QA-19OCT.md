# Android owner QA — 19 October 2026

Branch: `feat/android-qa-19oct`, based on bundled dev `e7ac3c5`.
The earlier configuration/no-access/chat fixes and Avenir update remain in the history.
**Implementation and builds are complete; final device acceptance is still open.**
The member and HQ/regional screen tours, real OTP, reservation, photo, manual check-in and
tag-free encoding checks below ran against dev. Final UI rechecks of the last fixes were
interrupted by host RAM pressure. This is not full acceptance approval.

## Environment and evidence

- PATS dev: `https://pats-univ.tail765d02.ts.net`.
- Own visible Pixel_10_Pro, host GPU, port **5554**, 1536 MB guest RAM. Other emulators
  **5556** and later **5570** were left untouched. No other emulator was stopped or reconfigured.
- Member matrix and final admin initial views: approximately **359 dp**, 1280 px / density 570.
  The first HQ scrolled matrix used density 480 (approximately 427 dp). Regional editor
  scrolled captures and the manual attendance interaction use 359 dp.
- **406 PNGs total** in this evidence set: **164 member PNGs**, **156 admin PNGs**, **8 public-card PNGs**, **8 login/OTP PNGs**.
  Additional interaction, branding, offline, large-text and mobile-web evidence is in the gallery.
- Gallery, original PNGs, UI XML and contact sheets:
  [open gallery](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/index.html).
  Filenames identify role, language, theme and screen; `-details` shows scrolled content.
  `beforefix-` explicitly preserves a defect's earlier appearance.
- iOS comparison is a source/API/behavior audit of `apps/ios`, not a live iPhone visual run.
  No UI taste changes beyond the approved requirements were applied.

## Defects fixed

| Defect | Fix and verification | Commit |
|---|---|---|
| Long KTM values shrank onto one line | Shared 0.6 wrap threshold, 0.42 minimum scale, 1.04 line advance; first cap-top alignment retained. Native max-length drink/genre saves and two-line cards checked; two boundary tests pass | `2e0be8a` |
| A failed post-write NFC report was lost on process death | Encrypted atomic no-backup storage, scoped to account/server; restore and retry before another write. Restart/isolation/clear test passes; physical write still needs tags | `4788114` |
| QA routes used pre-migration IDs; copy audit only checked EN | Current fixture UUIDs, scrolled/targeted captures, refreshed shared copy; both languages audited | `f44d471`, `62adaa2` |
| Claims omitted saved notes and private receipt viewing | Restore notes and owner-authorized signed receipt fetching with local error/retry feedback. Build passes; final member UI recheck remains open | `8c8f214` |
| City leaderboard defaulted to Bandung for a Jakarta member | Use member home city, keep National/City scope separate from the selected city. API confirms Bima's home city is Jakarta; final native recheck remains open | `8c8f214` |
| Receipt upload/read rejected migrated UUID member namespaces | Allow hyphenated member IDs while retaining signature, operation, expiry and traversal checks. Four receipt tests pass. Deployed dev still returns 404 until this backend fix is deployed | `1b9069e` |
| Event detail omitted the check-in window; admin omitted end time and attendance by method | Restore localized window/end time/phase badge and NFC / app QR / manual counts. Four-mode metadata captures and real 0/0/1 attendance evidence | `4daf0d5` |
| HQ lacked iOS's web event-management link | Add localized link using the selected server's `/events`; native EN label verified. Final four-mode recapture remains open | `cd3433a` |
| Native English date selection retained month-first device formatting | Explicit localized day / month / year NumberPickers, short-month names, clamping for shorter months; no private framework IDs. Build passes; final picker UI recheck remains open | `731308c`, `5dcfa9b` |
| Duplicate check-in / delivered-card notices used Indonesian dates in EN | Require explicit language in date formatting; use selected language in both crew notices. Build passes; updated duplicate screenshot still needs recapture | `f5423fe` |
| Gallery title was fixed to the preceding round | Parameterize and HTML-escape the title | `b4aac8d` |

## Member screen results

Unless qualified below, each route was captured in **EN + ID × light + dark** with initial
and scrolled content. The request-aware matrix rejects persistent network/API errors.

| Screen / state | Result |
|---|---|
| Home | Next event, XP, maroon KTM shortcut and lower navigation visible |
| KTM front/back/flip | Official front/back, embedded Avenir and white-on-maroon QR; status and private details outside the art; no member NFC reader action in any mode |
| Enlarge QR | Opens and closes in all four modes |
| Events | List, phase badges, dates and National scope toggle exercised |
| Event detail | Day-first 24-hour WIB metadata; booking/roaming/draw links. New check-in-window source builds; member recapture remains open |
| Wallet/rewards | Balance, catalogue, availability and ledger; no reward redeemed. Manual QA check-in adds the configured 50 XP |
| Leaderboard | Four-mode baseline and scope interaction; corrected home-city default awaits final native recheck |
| Claims / promoter route | Four-mode form and History tab. Restored notes/receipt UI awaits final native recheck; live receipt bytes need backend deployment |
| Live draw | Five outlined empty slots and disabled unavailable entry; no slot bought, draw run or prize awarded |
| Attendance history | Event/date/method rows in all modes; dedicated QA check-in additionally confirmed by API |
| Region change | Form, empty requests and disabled invalid submission; no region change submitted |
| Roaming | Event/type/review controls; no access grant requested |
| Hub | Timeline/chat/reservations navigation, city selection and channels |
| Timeline | Existing pinned content, live connection and like control visible; no post sent |
| Chat | Existing messages, composer and keyboard. Typed draft was cleared without sending a chat message |
| Reservation form | Slot map, selection, pax and notes. A native S1 booking for two persisted and opened its private conversation |
| Reservations / community operations | Member empty/list states; test booking subsequently cancelled and cancellation visible to admin |
| Notifications | List/deep-link controls; stored notification bodies retain their creation language |
| Preferences | Localized notification controls in all modes |
| Profile/account | Original signed photo, drink/genre/song and lower controls. Native 40/50-character save checked; original values and exact photo bytes restored |
| Camera/library | Native camera → capture → crop → upload → signed JPEG HTTP 200. Library selection reached crop and was cancelled. Real camera quality remains a phone check |
| Public digital ID | Front/back in four modes; private NIM/email/phone/song/quote exclusion assertions pass |
| Offline/large text | Identity retained without a usable QR; recovery copy and 1.4× card/profile captures in EN/light and ID/dark |
| Launcher/cold splash | Full crest uncropped in both schemes; no-animation cold launches captured to avoid transition frames |
| Logout/login/OTP | Native confirmation/logout and real demo OTP sign-in work; login and verification screen captured in all four modes |
| Join link | Android launches the selected dev `/join` origin, confirmed in ActivityTaskManager. Android Chrome stops at first-run setup; no terms/account setup accepted |
| Join form | Deployed form reviewed in desktop Chrome mobile emulation at 359×800, **not Android Chrome**. EN/ID × both preferences: forced light, body rgb(241,239,236), no horizontal overflow, day/month/year selects, favorite drink and localized empty-form validation. No enrolment request or new member created |

## Admin screen results

Real HQ and Jakarta regional-admin OTP sessions were used; server permissions remained
authoritative. HQ initial/scrolled tour covered 18 routes in four modes; regional create/edit
adds four-mode initial/scrolled views.

| Screen / state | Result |
|---|---|
| Tools/dashboard | Capability-filtered actions, counters and navy shell in four modes |
| Scan event list | Open event, time, phase and scan navigation visible |
| QR scanner | CameraX virtual-camera preview, manual route and unsupported NFC message; no physical/optical success claimed |
| Manual check-in | Native search → Bima preview → reason → confirm succeeds. Repeat preview blocks duplicate. Server has exactly one MANUAL record |
| Events list | Four-mode national/HQ data. Regional create action and create/edit forms checked; HQ web link added and EN label verified |
| Event detail/live attendance | End time/window and phase captured in four modes. Live count shows NFC 0 / app QR 0 / manual 1 with member/admin/reason |
| Create event | Four-mode blank form, day-first date button, 24-hour WIB controls, venue, capacity/description/publish and disabled invalid save |
| Edit event | Four-mode populated form; native save of the dedicated QA event succeeds without changing its values/status |
| Date/time dialogs | 24-hour time picker captured in four modes. Earlier date screenshots expose the device-order defect; final explicit day/month/year picker is built but not yet recaptured |
| Handover | Localized unsupported-NFC state in four modes; no tag handover attempted |
| Member-card search/detail | Search, identity/photo/status, reason validation and card/batch details; no card revoked or re-encode requested |
| Encode batches | Batch, status and progress in four modes |
| Encode station | Valid NIM → native member confirmation/lease; unsupported NFC notice; native cancellation releases the lease. A second station immediately acquires/releases it; card remains RECEIVED_HQ with no UID |
| Reward validation | Event/code form and QR entry controls in four modes; no reward handed over |
| Claims review | Pending/history navigation, empty pending state and review guidance in four modes; no claim approved/rejected |
| Operations/crew alias | City totals, recap fields, promoter/member rows and legacy reports; no revenue or promoter status changed |
| Community operations | Cancelled QA reservation, existing confirmed reservation, chat/roaming/moderation/screenshot sections; no message/moderation action sent |
| Admin hub/profile | Capability-specific navigation, signed account details, preferences and logout in four modes |

## Builds and acceptance boundaries

`testDebugUnitTest assembleDebug` passes: **24 tests, zero failures/errors**.
Foundation 4, member logic 3, admin validation 2, NTAG 5, QR 2, parity 3, profile 2,
card fitting 2, pending encode storage 1. The final picker implementation is included in
this build, although its last device recheck remains open.

`corepack pnpm --filter @pats/web exec vitest run test/loyalty/receipts.test.ts`: **4 pass**,
including UUID sign/write/read and existing tamper/expiry/traversal cases.
Copy audit: **396 literal keys in each language**. No AndroidRuntime fatal exception was
logged during the live tour.

Final APK: `apps/android/app/build/outputs/apk/debug/app-debug.apk`.
SHA-256: `E666E15393C17B926A9EC14BA54B64B5D8156E1AEC813DB97353A9F4C551BCA4`.
The embedded Avenir entry matches the shared private-repository file:
`897AF4EB430E2F6BA18BA7FBB72FBB8A7CDC6663729C60E7A707C05D81E29A6B`.
The official art/crest/font bytes are unchanged; fonts were not publicly uploaded.

| NATIVE-DESIGN §9 criterion | Evidence / remaining acceptance |
|---|---|
| Compact Android, four modes, navy band | Member and admin tours above; first HQ scrolled captures are wider. Final affected views listed below need rechecking |
| Original-master overlay within 1% | Unverified: original `example-front.png` absent locally; read-only SSH to its documented host fails host-key verification. Matching tokens/font bytes do not prove a master overlay |
| White-on-maroon scan at 30 cm / 30% brightness | Berlin's real phone/camera/display needed in both themes, including enlarged QR |
| Full crest icon/adaptive icon/splash | Emulator launcher/splash captures show the complete crest; release launcher/OEM masking remains a phone check |
| Day-first / 24-hour input | Event buttons and four-mode time picker pass; final explicit day/month/year picker requires device recheck |
| ≥44 touch targets / spoken accessibility | 48 dp controls, card label/status semantics and 1.4× text evidence; spoken TalkBack and physical usability remain phone checks |

Physical NTAG213/215/216 check-in, handover, encode/protection/re-encode, interrupted write
and post-write-report recovery still require Berlin's phone/tags. The fake-tag/JVM tests do
not establish physical NFC behavior. Real photo permission/EXIF/crop/face matching should
also be checked on the owner's phone.

## QA data, interruptions and remaining work

- Dedicated dev event: `Android QA 19 Oct 2026`, ID `01a1525c-dfb2-7470-acd8-f9750ec7ab04`.
  It remains open within its 19 October window; no paid booking or prize award was created.
- Bima's MANUAL check-in: `01a1529b-f69d-7268-86af-9ee8e1dcd9c1`,
  at `2026-10-19T05:21:55.345Z`, reason `Owner Android QA 19 Oct - manual check-in`.
  Configured credit **+50 XP**; wallet balance became **100 XP**. Audit/attendance records retained.
- Native S1 / pax 2 test reservation `01a15274-cf24-73c7-aaf6-04921c090e3a` is **CANCELLED**.
  The previous report's pending-cleanup warning is resolved.
- Original profile fields and exact original JPEG bytes are restored; signed photo returns HTTP 200.
  No chat message, new membership, XP claim, reward fulfilment, region change, promoter change
  or card write/revocation was submitted.
- Receipt fixture creation stopped at the deployed UUID-path 404; no new receipt claim was created.
  Existing Rara private-receipt read still returns **404 NOT_FOUND** while dev is online.
  Import/deploy `1b9069e`, then verify native upload and owner/crew signed viewing.
- Dev briefly went offline at 11:40 and again at 12:20 Bangkok, then recovered. Live tours resumed
  and booking cleanup/manual attendance completed; these are historical interruptions, not a
  claim that currently failed requests passed.
- Chrome first-run setup prevents the actual Android browser form run. Automatic approval review
  rejected the alternative Chromium test-shell download/install with **“blocked by policy”**.
  Mobile desktop-browser evidence is explicitly separated as `web-join-*`.
- A post-build sample showed **1.49 GB** free RAM. Trimming only PATS's working set recovered
  2.38 GB, so emulator-5554 was immediately shut down; free RAM recovered to 4.18 GB.
  Emulators 5556 and 5570 stayed untouched. The owner was asked for enough headroom for a
  final run; PATS will only restart with sufficient RAM to preserve the 3 GB floor.

Remaining live checks before full acceptance:

1. Install the final APK; verify the explicit date picker in EN/ID × light/dark, including
   shorter-month clamping and save/cancel. The stopped AVD still has an earlier experimental
   picker build, so install the final APK before using it.
2. Recapture the EN duplicate notice (Oct, not Okt), member event check-in window, claims
   History notes, Jakarta City ↔ National leaderboard, and the HQ web link after the last fixes.
3. After backend deployment, verify private receipt upload/viewing. Complete actual Android
   browser join and the physical/master/accessibility acceptance items above.
4. On the next allowed emulator run, restore density 480, font scale 1.0 and automatic night
   mode before shutdown. The urgent RAM shutdown left density 570; the temporary picker image
   was removed earlier and the Chrome automation command-line file was removed.

## Handoff

Bundle: `C:/Users/Berlin/pats-android-qa.bundle`, containing
`vm/dev..feat/android-qa-19oct`, recreated and verified after this report commit.
All round commits use Berlin <bagasputro.bp@gmail.com> as both author and committer,
with no co-author footer. No push was performed. Local demo credentials, screenshots
and `.qa` fixtures remain outside the Git bundle; screenshots are linked above.

## Screenshot index

See the gallery for scrolled/interaction/before-fix evidence. The following links index
the initial four-mode captures; a capture does not imply that a later source fix was
rechecked unless the result table explicitly says so.

| Screen / state | EN light | ID light | EN dark | ID dark |
| --- | --- | --- | --- | --- |
| admin / claims | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-light-claims.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-light-claims.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-dark-claims.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-dark-claims.png) |
| admin / codes | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-light-codes.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-light-codes.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-dark-codes.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-dark-codes.png) |
| admin / community | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-light-community.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-light-community.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-dark-community.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-dark-community.png) |
| admin / create | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-light-create.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-light-create.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-dark-create.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-dark-create.png) |
| admin / crew | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-light-crew.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-light-crew.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-dark-crew.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-dark-crew.png) |
| admin / edit | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-light-edit.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-light-edit.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-dark-edit.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-dark-edit.png) |
| admin / encode | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-light-encode.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-light-encode.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-dark-encode.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-dark-encode.png) |
| admin / event | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-light-event.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-light-event.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-dark-event.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-dark-event.png) |
| admin / events | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-light-events.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-light-events.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-dark-events.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-dark-events.png) |
| admin / handover | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-light-handover.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-light-handover.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-dark-handover.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-dark-handover.png) |
| admin / hub | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-light-hub.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-light-hub.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-dark-hub.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-dark-hub.png) |
| admin / manual | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-light-manual.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-light-manual.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-dark-manual.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-dark-manual.png) |
| admin / member | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-light-member.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-light-member.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-dark-member.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-dark-member.png) |
| admin / members | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-light-members.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-light-members.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-dark-members.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-dark-members.png) |
| admin / operations | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-light-operations.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-light-operations.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-dark-operations.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-dark-operations.png) |
| admin / profile | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-light-profile.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-light-profile.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-dark-profile.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-dark-profile.png) |
| admin / scan | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-light-scan.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-light-scan.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-dark-scan.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-dark-scan.png) |
| admin / scanner | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-light-scanner.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-light-scanner.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-dark-scanner.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-dark-scanner.png) |
| admin / station | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-light-station.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-light-station.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-dark-station.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-dark-station.png) |
| admin / tools | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-light-tools.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-light-tools.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-en-dark-tools.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/admin-id-dark-tools.png) |
| auth / login | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/auth-en-light-login.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/auth-id-light-login.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/auth-en-dark-login.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/auth-id-dark-login.png) |
| auth / verify | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/auth-en-light-verify.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/auth-id-light-verify.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/auth-en-dark-verify.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/auth-id-dark-verify.png) |
| member / card | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-card.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-card.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-card.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-card.png) |
| member / card-back | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-card-back.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-card-back.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-card-back.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-card-back.png) |
| member / chat | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-chat.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-chat.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-chat.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-chat.png) |
| member / claims | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-claims.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-claims.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-claims.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-claims.png) |
| member / draw | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-draw.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-draw.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-draw.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-draw.png) |
| member / event | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-event.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-event.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-event.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-event.png) |
| member / events | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-events.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-events.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-events.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-events.png) |
| member / history | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-history.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-history.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-history.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-history.png) |
| member / home | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-home.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-home.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-home.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-home.png) |
| member / hub | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-hub.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-hub.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-hub.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-hub.png) |
| member / leaderboard | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-leaderboard.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-leaderboard.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-leaderboard.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-leaderboard.png) |
| member / notifications | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-notifications.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-notifications.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-notifications.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-notifications.png) |
| member / preferences | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-preferences.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-preferences.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-preferences.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-preferences.png) |
| member / profile | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-profile.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-profile.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-profile.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-profile.png) |
| member / promoter | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-promoter.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-promoter.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-promoter.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-promoter.png) |
| member / region | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-region.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-region.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-region.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-region.png) |
| member / reservation | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-reservation.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-reservation.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-reservation.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-reservation.png) |
| member / reservations | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-reservations.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-reservations.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-reservations.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-reservations.png) |
| member / rewards | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-rewards.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-rewards.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-rewards.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-rewards.png) |
| member / roaming | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-roaming.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-roaming.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-roaming.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-roaming.png) |
| member / timeline | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-light-timeline.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-light-timeline.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-en-dark-timeline.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/member-id-dark-timeline.png) |
| public / card | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/public-en-light-card.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/public-id-light-card.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/public-en-dark-card.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/public-id-dark-card.png) |
| public / card-back | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/public-en-light-card-back.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/public-id-light-card-back.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/public-en-dark-card-back.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/public-id-dark-card-back.png) |
| web join (desktop mobile) / contact | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/web-join-en-light-contact.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/web-join-id-light-contact.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/web-join-en-dark-contact.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/web-join-id-dark-contact.png) |
| web join (desktop mobile) / favorites | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/web-join-en-light-favorites.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/web-join-id-light-favorites.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/web-join-en-dark-favorites.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/web-join-id-dark-favorites.png) |
| web join (desktop mobile) / form | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/web-join-en-light-form.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/web-join-id-light-form.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/web-join-en-dark-form.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/web-join-id-dark-form.png) |
| web join (desktop mobile) / validation | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/web-join-en-light-validation.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/web-join-id-light-validation.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/web-join-en-dark-validation.png) | [PNG](C:/Users/Berlin/Documents/Dev/pats-shots/qa-19oct/web-join-id-dark-validation.png) |
