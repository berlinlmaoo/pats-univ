# Card value font

`card-value.ttf` is the ONE font used for the KTM values (name, favorite drink, favorite genre) on
web, iOS, Android and the print files, so the card looks identical everywhere (Berlin, 18 Oct).

**Now: Avenir Black** (Monotype GmbH, 2018, PostScript name `Avenir-Black`, weight 900), the face
of the official card. Replaced Figtree Black on 19 Oct 2026.

## Licence (read before touching this file)

- Commercial font, © Monotype GmbH. PATS holds an **App + Web** licence; the owner (Berlin) has
  the invoice. That licence covers embedding the file in the web app, the iOS/Android apps and the
  card print PDFs we make.
- This repository is **private**. Never copy the font anywhere public: no public repo, gist, CDN,
  design-tool upload, npm package, issue attachment or chat. Don't commit other Avenir weights or
  macOS system fonts (`.ttc`) here; the licensed originals live outside the repo.
- If the repo ever goes public, remove this file (and its copy, below) first and rewrite history.

## Consumers

`apps/web/src/app/layout.tsx` (next/font/local → `--font-card`), the native apps (bundle this same
file, see docs/NATIVE-DESIGN.md), `apps/web/card-templates/ktm-2026/fonts/card-value.ttf` (byte copy
embedded in the PDF; `apps/web/test/card-print.test.ts` fails if the two differ).

Metrics and fit, all in `tokens.ts` → `fonts.cardValue` / `ktm`: tracking **−0.065 em**, cap height
0.708 em, cap top 0.065 em into a line-height-1 box, all caps, #000. Fitted on 19 Oct against the
official `example-front.png` (MICHAEL WIBOWO / TEQUILA / HIPHOP, BREAKBEAT): left edge, cap top,
baseline and right edge of every value within 0.3% of card width.

Swapping the face again: replace both copies under the same name, then re-fit `capHeight`,
`capTop`, `tracking`, `valueX` and `valueCap` against the example and update the print template.
