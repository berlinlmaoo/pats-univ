# Card print templates

Each folder here is one print template for the KTM. The server renders it with headless
Chromium into one PDF per member (front + back), a batch PDF and a CSV manifest for the vendor
(PLAN.md §4 Phase 2). `placeholder/` is built from the brand tokens and the crest until the team's
artwork arrives (T8c).

## Swapping in the real artwork

1. Copy `placeholder/` to a new folder, e.g. `pats-2026/`.
2. Put the artwork in it (SVG, or PNG/JPG at **300 dpi or more** at its printed size: a full
   background with bleed is 1082 × 709 px at 300 dpi) and reference it with `{{asset:<file>}}`.
3. Edit `template.html`. Keep the two `<section class="page">` blocks: front first, then back.
4. Point the server at it: `CARD_TEMPLATE_DIR=card-templates/pats-2026` (relative to `apps/web`,
   or an absolute path), then **Generate files again** on the batch in the dashboard.

No code changes are needed.

## Rules

| | |
|---|---|
| Page | 91.6 × 60 mm = CR80 85.6 × 54 mm + 3 mm bleed on each side |
| Trim | 3 mm in from the page edge; the PDF's TrimBox and BleedBox are set to match |
| Safe area | Text and the QR stay `safeMm` (4 mm) inside the trim edge |
| Printed data | Only `{{fullName}}`, `{{nim}}` and `{{qr}}`. Song, genre and quote are never printed (PRODUCT.md §10.3) |
| QR | `{{qr}}` is an SVG of `https://patsuniv.znetworks.id/c/<token>`, error correction M with its quiet zone. Print it dark on white, at least 18 mm wide |
| Fonts | Ship the font files in the folder (`{{asset:fonts/…}}`); the PDF embeds them |

`data-fit="lines:2;min:8.5"` on an element shrinks its font size (down to 8.5 pt) until the text
fits in two lines, so long names never clip.

`template.json` holds the template name and the bleed/safe values used for the proof overlay
(**Preview with guides** in the dashboard draws the trim line in red and the safe area in blue).
