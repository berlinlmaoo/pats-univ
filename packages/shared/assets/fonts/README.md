# Card value font

`card-value.ttf` is the ONE font used for the KTM values (name, favorite drink, favorite genre) on
web, iOS, Android and the print files, so the card looks identical everywhere (Berlin, 18 Oct).

Now: Figtree Black (OFL, `OFL.txt`), the closest free match to the card's Avenir LT Pro Black.
When the licensed Avenir LT Pro Black (App + Web licence) arrives, replace this file with it under
the same name: no code changes. Never commit macOS system fonts (.ttc) or unlicensed files.

Consumers: `apps/web/src/app/layout.tsx` (next/font/local → `--font-card`), `apps/mobile` (expo-font,
same file), `apps/web/card-templates/ktm-2026` (embedded in the PDF). Tracking −0.04 em, all caps,
#000 (`tokens.ts` → `fonts.cardValue`).
