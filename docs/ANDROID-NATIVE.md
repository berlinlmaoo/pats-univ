# PATS University native Android

18 October 2026. Package `id.znetworks.patsuniv`, Kotlin + Jetpack Compose in `apps/android`.
The existing web API and realtime service remain unchanged. iOS should mirror the screen and
endpoint inventory below. Phase 5 business rules supersede the historical wheel and PR-report flows.

## Phase status

| Phase | Status | Validation |
|---|---|---|
| 1 Foundation | Complete | 4 JVM tests and debug APK pass; real demo OTP member/admin login, EN/ID profiles, navigation, logout and card-link error on Pixel_10_Pro |
| 2 Member screens | Pending | |
| 3 Admin screens | Pending | |
| 4 Parity | Pending | |

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

Use only `Pixel_10_Pro` and explicitly pass its serial to every ADB command. It was identified as
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

The completion marker is intentionally absent until all phases and required emulator checks pass.
