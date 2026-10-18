# PATS University native iOS

18 October 2026. SwiftUI in `apps/ios`, bundle `id.znetworks.patsuniv`, team `5YR5T42G97`.
`project.yml` is the XcodeGen source of truth. The backend and Expo sources are unchanged.

## Status

- Foundation: XcodeGen, PATS palette and crest, Inter/Jakarta fonts, EN/ID shared dictionaries,
  duplicate-key/locale parity build check, OTP including demo code and resend cooldown,
  Keychain session cache, serialized refresh-token rotation, theme/language settings,
  member/admin capability detection, public `/c/<token>` links, native push delegate,
  Socket.IO v4 over URLSession WebSocket following NEXUS's dependency-free approach.
- Member screens: in progress.
- Admin screens and NFC: pending.
- Parity audit: pending.

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
