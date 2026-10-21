# Card print templates

Each folder here is one print template for the KTM. The server renders it with headless
Chromium into one PDF per member (front + back), a batch PDF and a CSV manifest for the vendor
(PLAN.md §4 Phase 2). **`ktm-2026-qotd/` is the default**: the owner's 21 Oct 2026 KTM artwork
(blank front with NAME / FAVORITE DRINK / QOTD + back). `ktm-2026/` is the 18 Oct artwork (third
line FAVORITE GENRE), kept for reference and reprints; `placeholder/` is the old token-built card.

## ktm-2026-qotd (default since 21 Oct 2026)

- Same geometry, font and QR as `ktm-2026` below; the third value is **QOTD** (`{{quote}}`, the
  member's quote), up to two full-size lines (`data-fit="box:2;min:5.5"`: a longer quote shrinks
  until it fits the height of two full-size lines). Empty quote = the label stays blank.
- `front.jpg` / `back.jpg` come from the 21 Oct masters (`ktm-front-blank.png`, `ktm-back.png`) via
  `tools/brand/make-assets.sh <official dir> <ktm-21oct dir>`. The artwork is swappable: replace the
  two images (same 3213 × 2079 ratio) and regenerate; never redraw it.
- Members who joined before 18 Oct have no favorite drink, and the quote is optional: blank lines
  print blank. Regenerate a batch's files (**Generate files again**) to print it on the new design.

## ktm-2026

- Front: `front.jpg` (the official blank front) on the trim box; values NAME / FAVORITE DRINK /
  FAVORITE GENRE in `fonts/card-value.ttf` (licensed Avenir Black), black, all caps, −0.065 em; the QR in **white modules
  inside the artwork's maroon tile** (`{{qrInverse}}`, 19.7 mm, error correction M). No NIM.
- Back: `back.jpg`, the official back as-is.
- Bleed: the artwork has no bleed of its own, so the same image is stretched underneath to fill the
  3 mm. Swap in vendor artwork with real bleed when it exists.
- `front.jpg` / `back.jpg` come from `tools/brand/make-assets.sh` (1440 px ≈ 427 dpi at 85.6 mm).
- `fonts/card-value.ttf` is a **copy** of `packages/shared/assets/fonts/card-value.ttf` (the
  template folder is all the print container ships). `test/card-print.test.ts` fails if the two
  differ: whenever the shared file changes, copy it here too. The font is Monotype-licensed:
  this repo is private and the file must never be copied anywhere public.
- An inverted QR (light on dark) scans on current iOS/Android cameras and the crew app; test a
  printed proof with the crew app before sending a batch to the vendor.

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
| Printed data | `{{fullName}}`, `{{favoriteDrink}}`, `{{quote}}` (QOTD, 21 Oct design) and the QR; `{{favoriteGenre}}` for the 18 Oct design. NIM and song are never printed (PRODUCT.md §10.3); `{{nim}}` still exists for older templates |
| QR | `{{qr}}` is an SVG of `https://patsuniv.znetworks.id/c/<token>`, navy on white with its quiet zone; `{{qrInverse}}` is the same code in white modules on transparent with no quiet zone (for a dark tile). At least 18 mm wide |
| Fonts | Ship the font files in the folder (`{{asset:fonts/…}}`); the PDF embeds them |

`data-fit="lines:2;min:8.5"` on an element shrinks its font size (down to 8.5 pt) until the text
fits in two lines, so long names never clip.

`template.json` holds the template name and the bleed/safe values used for the proof overlay
(**Preview with guides** in the dashboard draws the trim line in red and the safe area in blue).
