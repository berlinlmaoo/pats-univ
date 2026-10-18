# PATS University for iOS

SwiftUI, iOS 17+, iPhone and iPad. XcodeGen owns the project. Bundle ID
`id.znetworks.patsuniv`, Apple team `5YR5T42G97`.

## Compile only

From the repository root:

```sh
apps/ios/scripts/build-compile.sh
```

This waits for every existing `xcodebuild`, requires at least 6 GB free, generates the project,
and builds `PATS` for `generic/platform=iOS Simulator` with two jobs and derived data in
`~/dd-pats-ios`. It never boots a simulator or runs the application. Keep that restriction
until Berlin explicitly authorizes running it.

## Development origin

Set `PATS_DEV_SERVER_URL` in the ignored `Config/Local.xcconfig` (see `Debug.xcconfig`
for the Xcode URL-escaping syntax). It is substituted into Info.plist before signing.
The login screen offers development or production in Debug. Release uses the canonical
production origin, with no development switch.
Sessions and pending encode reports are scoped to the server origin.

The signed media, receipt and member-photo routes can use the development origin in Debug, preserving their
encoded path/query exactly, matching the Android client. Release never rewrites signed URLs.
Fix the deployment's APP_URL for production rather than depending on this development fallback.

## Shared resources and tests

```sh
cd apps/ios
node scripts/sync-shared.mjs
scripts/check-localization.sh
swift test --build-system native --jobs 2
```

The importer reads `packages/shared` dictionaries and colors; It also copies the approved full crest, icon, splash, card artwork and Figtree/Graduate/shared
card-value fonts, and generates Swift card geometry from `tokens.ts`. Native-only copy lives in
`scripts/en-native.json` and `scripts/id-native.json`. Both language tables must have identical,
unique keys. Localization checking also runs during every app build.

The small SwiftPM package exercises the actual encoder, wire parser, QR deadline, formatting
and API session code on macOS. Network tests use URLProtocol and in-memory storage; they never
connect to an account, write the app's Keychain, start a backend, or launch a simulator.

## Implementation

- `APIClient`: actor, ephemeral URLSession, Keychain session, shared refresh flight, stale-session
  rejection and server-origin isolation. Signed uploads never include bearer credentials.
- `RealtimeRoom`: NEXUS-style dependency-free Socket.IO v4 / Engine.IO v4 WebSocket transport,
  acknowledgements, heartbeat, reconnect and room-access expiry. REST provides catch-up/fallback.
- `CardReader`: physical Core NFC sessions behind a protocol. `Core/NTAG` uses `TagIO`, with a
  fake in the macOS test target and shared Card Station command fixtures.
- SwiftUI views use shared palettes/fonts, native controls, SF Symbols, EN/ID copy, centred
  alerts, retry/error/loading states, camera capture and AVPlayer playback.

Screen/API inventory, parity gaps, verification evidence and owner device/release tasks are in
[IOS-NATIVE.md](../../docs/IOS-NATIVE.md). APNs registration is ready, but delivery requires
backend APNs support; the existing server accepts Expo tokens only.
