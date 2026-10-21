# Native KTM artwork — 21 October 2026

The owner-supplied front blank template and fixed back replace the previous native card design. The asset catalog keeps the PNG files unchanged:

- `Sources/Resources/Assets.xcassets/KTMFront.imageset/KTMFront.png` — 3213 × 2079.
- `Sources/Resources/Assets.xcassets/KTMBack.imageset/KTMBack.png` — fixed back and rules.

`KTMCard.swift` isolates the artwork geometry from the screen and shared web/print geometry. It overlays NAME (`fullName`), FAVORITE DRINK (`favoriteDrink`), and QOTD (`quotes`) in the licensed bundled card typeface, uppercase with the established tracking. White QR modules sit inside the maroon box. The front/back switch supports Reduce Motion and accessibility actions.

To replace the artwork, replace the two asset PNGs and update only `NativeKTMGeometry` if the printed field positions change. Keep the asset names. `scripts/sync-shared.mjs` checks these assets exist and intentionally preserves them; it no longer imports the superseded web artwork. Do not embed personalized values in the templates.
