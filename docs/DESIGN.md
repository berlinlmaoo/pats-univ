# PATS University — Design

Version 2.0, 18 Oct 2026. **The KTM is the design.** Everything here is derived from the official student card (front, back) and the official logo files. It applies to the web dashboard, `/join`, `/login`, the public digital ID `/c/<token>`, the Expo app (see [NATIVE-DESIGN.md](NATIVE-DESIGN.md)), card print files and emails.

Older versions (1.x: cream SaaS, Inter + Plus Jakarta, the shield cut-out) are retired. Where this file and older reports disagree, this file wins.

## 0. Source of truth

| What | Where (masters stay out of the repo) |
|---|---|
| KTM front (blank + example), back | `pats-univ:~/pats-univ-brand/ktm/` (`blank-front.png` 3213 × 2079, `example-front.png`, `example-back.png/.svg`) |
| Logo (THE mark) | `pats-univ:~/pats-univ-brand/official/PATS UNIV_NEW LOGO-01.png` (9000 px, full crest, transparent) |
| Logo variants | `LOGO-02/03` one-colour crest (black / outlined), `LOGO-07` cream "PATS / UNIVERSITY" ribbon lockup, `LOGO-08` maroon, `LOGO-09` navy, `LOGO-10` black, `LOGO-11` white lockup, `LOGO_BG-04/05/06` crest on navy / white / black |
| Generated sizes | `tools/brand/make-assets.sh <official dir> <ktm dir>` → `apps/web/public/{brand,ktm}`, favicons, `og.png`, `apps/mobile/assets`, `apps/web/card-templates/ktm-2026/{front,back}.jpg` |

**Logo rules (Berlin, 18 Oct).** The full crest (LOGO-01) is the logo everywhere: web header, sidebar, auth pages, favicons, apple-touch icon, PWA icons, OG image, the app icon and the splash. Assets are made **only by resizing, padding onto a solid canvas, or removing fully transparent margin**. Never crop into the mark, mask a part out (the old shield cut-out is banned), recolour, redraw or re-letter it. At 16–32 px the crest's small text cannot be read: that is accepted, the full crest stays. The ribbon lockup (LOGO-07 cream on navy, LOGO-09 navy on paper) is an official mark too: use the file as-is, never retype "PATS UNIVERSITY" as a logo.

## 1. The world in one paragraph

The card front is a **navy header band** with a **gold rule** under it, sitting on **grey paper**; labels are small heavy caps (`NAME :`), values are big **black heavy caps** (Avenir Black); the QR lives in a **distressed maroon tile**; the crest sits top-right. The back is **navy night** with cream varsity lettering and a maroon ribbon. So:

- **Light scheme = the card front.** Paper ground, white-paper surfaces, navy ink, the navy band for app bars and the sidebar, gold rules for structure, maroon only for the card-related action.
- **Dark scheme = the card back.** Navy night ground, card-navy surfaces, cream text, gold as the accent (focus, active tab), maroon for the card-related action.
- **The band is navy in both schemes.** Sidebar, mobile top bar, dialog headers and the auth panel are always the card header.
- **Operate surfaces stay calm.** Data reads in Figtree at normal case; the brand lives in the band, the gold rule, the label caps, squared corners and one varsity line per screen. Persuade moments (`/join`, `/c/<token>`, login) carry the card itself at full size.

## 2. Where the tokens live

All values are defined once in [`packages/shared/src/tokens.ts`](../packages/shared/src/tokens.ts) (colours in [`colors.json`](../packages/shared/src/colors.json) so Expo's `app.config.ts` can read them).

| Consumer | How |
|---|---|
| Web | Root layout injects `toCssVariables()` as `--pats-*` (light, dark via `prefers-color-scheme`, forced via `data-theme`). [`globals.css`](../apps/web/src/app/globals.css) maps them onto Tailwind (`bg-band`, `text-band-fg`, `bg-gold`, `text-gold-fg`, `rounded-card`, `shadow-card`, …) and defines the brand utilities `varsity`, `ktm-label`, `ktm-value`, `gold-rule`. |
| App | `apps/mobile/src/theme` imports the same objects (`colors`, `type`, `varsity`, `ktm`, `radius`, `space`, `size`). |
| Email | `apps/web/src/lib/email/templates.ts` inlines the light colours. |
| Print | `apps/web/card-templates/ktm-2026/` uses the card artwork itself. |

Rule: **no raw colour, font size, radius or spacing in components.** Missing value → add a token first.

## 3. Colour

### Brand (`brand` in tokens)

| Token | Hex | On the card |
|---|---|---|
| `navy` | `#001836` | Crest navy; light primary/accent |
| `cardNavy` | `#071935` | The header band as printed (sampled); `band` light, `surface` dark |
| `gold` | `#c8a26f` | The rule under the header (sampled) |
| `paper` | `#f2f2f3` | The grey paper body (sampled) |
| `maroon` | `#360c0c` | Crest maroon; the QR tile (`#3f1d1d` with grain as printed) |
| `cream` | `#fcead8` | Crest scroll; lettering on the back; text on navy |
| `ink` | `#000000` | Card values |

### Semantic

| Token | Light (card front) | Dark (card back) | Use |
|---|---|---|---|
| `bg` | `#f1efec` | `#020b19` | Page ground (paper / navy night) |
| `surface` | `#fcfbf9` | `#071935` | Cards, inputs, sheets |
| `surfaceMuted` | `#e9e6e1` | `#0c2246` | Table headers, wells |
| `surfaceHover` | `#e3dfd8` | `#112a54` | Row / ghost hover |
| `border` | `#d9d3ca` | `#1b3462` | Hairlines |
| `borderStrong` | `#867e72` | `#5d7398` | Input edges (3:1) |
| `text` | `#0b1220` | `#f6efe4` | Primary text (navy ink / cream) |
| `textMuted` | `#4c5361` | `#aeb8c9` | Secondary text |
| `placeholder` | `#666b76` | `#8f9bb0` | Placeholders only |
| `primary` / `primaryText` | navy / cream | cream / navy | Primary buttons (header band ↔ back lettering) |
| `accent` / `accentText` | navy / navy | gold `#c8a26f` / `#e3c690` | Focus ring, links, selection |
| `accentSubtle` / `…Text` | `#e1e6ee` / navy | `#16305c` / `#dde4f0` | Info alerts, accent badges |
| `secondary` / `secondaryText` | maroon / cream | `#6b2020` / cream | **The card action** (show KTM, check in, run draw), count chips |
| `secondarySubtle` / `…Text` | `#f0e2df` / maroon | `#2c1418` / `#f0c9c3` | Maroon chips |
| `gold` | `#c8a26f` | `#c8a26f` | Rules and indicators only, never text |
| `goldText` | `#6f5226` | `#e3c690` | Gold as text (rank #1, period) |
| `band` / `bandText` / `bandMuted` | `#071935` / cream / `#b9c2d3` | `#000f24` / cream / `#aeb8c9` | The header band in both schemes |
| `success*`, `warning*`, `danger*` | see file | see file | Status only. **Never** navy/maroon/gold for status, never maroon for errors |

### Contrast (WCAG 2.x AA, recomputed by `packages/shared/test/shared.test.ts`)

| Pair | Light | Dark | Needs |
|---|---|---|---|
| `text` on `bg` | 16.31 | 17.27 | 4.5 |
| `text` on `surface` | 18.10 | 15.33 | 4.5 |
| `text` on `surfaceHover` | 14.10 | 12.40 | 4.5 |
| `textMuted` on `surfaceHover` | 5.82 | 7.08 | 4.5 |
| `placeholder` on `surface` | 5.17 | 6.24 | 4.5 |
| `primaryText` on `primary` | 15.12 | 15.12 | 4.5 |
| `accentText` on `surface` | 17.15 | 10.63 | 4.5 |
| `secondaryText` on `secondary` | 14.74 | 9.66 | 4.5 |
| `goldText` on `surface` | 6.98 | 10.63 | 4.5 |
| `bandText` on `band` | 14.92 | 16.36 | 4.5 |
| `bandMuted` on `band` | 9.77 | 9.60 | 4.5 |
| `successText` on `successSubtle` | 5.81 | 9.23 | 4.5 |
| `warningText` on `warningSubtle` | 5.98 | 10.39 | 4.5 |
| `dangerText` on `dangerSubtle` | 5.53 | 7.66 | 4.5 |
| `onSolid` on `dangerSolid` | 5.62 | 5.62 | 4.5 |
| `accent` on `surface` (non-text) | 17.15 | 7.38 | 3 |
| `borderStrong` on `surface` (non-text) | 3.87 | 3.64 | 3 |
| `gold` on `band` (non-text) | 7.38 | 8.09 | 3 |
| Card: ink on paper / white QR on maroon tile / cream on navy | 18.77 / 14.95 / 14.92 | same | 4.5 |

Status mapping (unchanged meaning): card `NOT_PRINTED` neutral · `IN_BATCH`/`SENT_TO_VENDOR`/`RECEIVED_HQ` accent · `ENCODED` warning · `DELIVERED` success · `REVOKED` danger. Event phase `draft` neutral · `upcoming` accent · `open` success · `closed` warning · `ended` neutral. Claim `PENDING` warning · `APPROVED` success · `REJECTED` danger.

## 4. Type

| Face | Role | Web / Android | iOS |
|---|---|---|---|
| **Graduate** (Google Fonts, OFL) | The card header's collegiate slab. **Display only, one line per screen**: page titles, the auth/join hero, the digital ID. Always upper case | `next/font/google` / `@expo-google-fonts/graduate` | bundled `Graduate-Regular.ttf` |
| **Card value font** (`fonts.cardValue`, `--font-card`) | KTM values only. ONE embedded file on every platform and in print: `packages/shared/assets/fonts/card-value.ttf`. **Avenir Black** (Monotype, licensed App + Web; owner holds the invoice; private repo only, never copied anywhere public), tracking **−0.065 em**, cap height 0.708 em, fitted to `example-front.png` within 0.3% of card width. **Never system Avenir**: the card must look identical on web, iOS and Android | `next/font/local` / `expo-font` | same file via `expo-font` |
| **Figtree** (OFL) | Everything else; close to Avenir's geometry | `next/font/google` 400–900 / `@expo-google-fonts/figtree` | same (or system Avenir Next for body if preferred, keep one) |

Graduate was picked against the card's "PATS UNIVERSITY" (compared with Alfa Slab One, Bevan, Ultra, Holtwood, Roboto Slab, Arvo): it has the same collegiate letterforms (square S, wide R, bracketed slabs) but ships one light weight, so it is drawn with a stroke of `varsityStroke` (0.045 em) in the text colour (`-webkit-text-stroke` + `paint-order: stroke fill` on web), which matches the card's heavy block.

| Style | Size / line | Weight | Tracking | Notes |
|---|---|---|---|---|
| `varsity.hero` | 40/44 | Graduate + stroke | +2% | Join/login/digital-ID hero |
| `varsity.title` | 28/34 | Graduate + stroke | +2% | Dashboard page title (`PageHeader`) |
| `varsity.small` | 18/22 | Graduate | +2% | Rare: card captions |
| `display` | 32/38 | 800 | −1.5% | Big numbers |
| `title1` | 26/32 | 800 | −1% | Stat values (900 on web) |
| `title2` | 20/26 | 800 | −0.5% | Section titles |
| `title3` | 17/22 | 700 | — | Card titles (800 on web) |
| `bodyLg` / `body` / `bodySm` | 16/24 · 15/22 · 14/20 | 400 | — | Text, dashboard default 14 |
| `caption` | 13/18 | 400 | — | Meta |
| `label` | 11/16 | 800 (web 900) | +6%, CAPS | The card's `NAME :` labels: field labels, table headers, stat labels, nav groups, tabs, badges |

Numbers, NIMs, money and dates use tabular figures. App text caps Dynamic Type at 1.4×.

## 5. Shape, space, depth, motion

- **Radius** (squarer, like a printed card): `sm` 4 (chips, nav items), `control` 6 (buttons, inputs), `card` 10 (cards, dialogs), `pill` for avatars only. The KTM uses its own corner (`ktm.radius` = 3.7% of width ≈ CR80's 3.18 mm).
- **Spacing:** 4-pt scale (unchanged). Gutters 16 mobile, 24–40 dashboard; card padding 20 web / 16 app.
- **Depth:** `soft` (1–6 px, navy-tinted) for cards, `pop` for dialogs, `card` for the KTM. No glow, no glass.
- **Gold rule:** 3 px, `gold`. Under every band (sidebar head, top bar, dialog header, auth header), under the page title, under the active tab, and as a 24 × 3 px tick above card titles. Nowhere else.
- **Motion:** 150 / 200 / 300 ms on `cubic-bezier(0.2,0,0,1)`. One signature moment: the **KTM flip** (500 ms rotateY; reduced motion = 200 ms crossfade). Buttons press to 0.98. `prefers-reduced-motion` removes the rest.

## 6. Components

Web: `apps/web/src/components/ui` (+ `components/ktm`). App: `apps/mobile/src/components`. Same names on both.

| Component | Rules |
|---|---|
| **KTM card** (`KtmCard`) | Background = official blank front (`/ktm/front-{800,1600}.webp`; app: bundled @2x/@3x WebP). Overlaid live values NAME / FAVORITE DRINK / FAVORITE GENRE in `ktm-value` (the one card-value font, Avenir Black), **#000, all caps, −0.065 em**, positioned by the `ktm` geometry token (fractions of the artwork, so it scales from a 120 px thumbnail to full screen); values shrink to fit their max width, never clip or wrap. The QR is **white modules on transparent inside the maroon tile** (EC M). NIM is never on the card. Flip button shows the official back (`/ktm/back-*.webp`). Thumbnails (member detail, lists) omit the QR. `aspect-ratio` = 3213/2079, `shadow-card`. |
| **Band** | `bg-band text-band-fg gold-rule`. Holds the crest (`Wordmark`), a heavy-caps label, and band-styled controls (`LanguageSwitch onBand`, white/10 hover). |
| **Wordmark / BrandLockup** | `Wordmark` = full crest (LOGO-01) at `size.crest` 40 (48 sidebar, 72 auth). `BrandLockup tone=cream|navy` = official ribbon lockup files. Alt "PATS University"; lockup decorative when the crest is present. |
| **Page header** | Varsity title (`varsity`), muted description ≤ 2 lines, actions right, 3 px gold rule below. One varsity line per page. |
| **Tabs** (`Tabs`) | The only sub-navigation (replaces segmented / pill / underline-link variants). Heavy-caps labels, gold 3 px indicator on the active tab, optional maroon count chip, scrolls sideways under 640 px. Link tabs for routes, `role=tablist` with arrow keys for panels. |
| **Button** | `primary` (navy/cream; dark cream/navy; hover shows a gold underline), `secondary` (surface + strong edge), `ghost`, `danger` (real red), `maroon` (**one card-related action per screen**). Bold, sentence case, never truncated. Disabled = transparent fill + dashed edge + muted text in both schemes (never a pale "active" look). Loading keeps width. Heights 32/40/48; touch ≥ 44 in the app. |
| **Input / Select / Textarea** | 48 high, radius 6, `borderStrong` edge (3:1), focus = accent edge + 4 px ring (gold in dark). Labels above in `ktm-label` caps; hint/error below in caption; error replaces hint and is announced. |
| **Date & time** | Always day-first and 24 h, in the city's zone with "WIB" in the label: `14/10/2026`, `19.30`. Never the browser's US `mm/dd/yyyy` / AM-PM (`components/ui/date-time.tsx`). |
| **Money** | Typed and shown as `Rp 6.000.000` (thousands dots), stored as an integer. |
| **Card** | `surface`, 1 px `border`, radius 10, `soft`. `CardHeader` = gold tick + `title3` 800 + muted description + one action. No nested cards. |
| **Badge** | 24 high, radius 4, 11 px heavy caps, optional status dot. Status colours only here (and alerts). |
| **Count chip** | Maroon square chip with cream numerals (nav, tabs). |
| **Table** | Header row 40 on `surfaceMuted` with `ktm-label` caps; body rows 56; numbers right-aligned tabular. Scrolls inside its card; **under 640 px rows become stacked cards with the row action visible** (never a clipped action column). |
| **Detail list** | `ktm-label` term, value in body. |
| **Stat** | `ktm-label` label, value Figtree 900 tabular. Max 4 in a row; no hero-metric template. |
| **Empty state** | Navy square well with cream icon and gold tick (a mini band), title (why), one line (what next), at most one action. |
| **Loading** | Skeleton blocks in `surfaceMuted` matching the final layout; spinners only inside buttons. |
| **Error** | `Alert tone=danger` with what happened + the recovery action; page-level errors use the empty-state layout with "Coba lagi". |
| **Alert** | `info` (accent subtle), `success`, `warning`, `danger`; icon + text, radius 6. |
| **Dialog** | Platform `<dialog>`. Band header with gold rule (title + close), scrolling body, footer pinned with a hairline (never cut off on a 900 px screen). Destructive confirm uses `danger`. App: centred `.alert`/`Alert.alert` for confirmations. |
| **Sidebar** (dashboard) | The band, 248 wide: crest 48 + "DASHBOARD" + role/city; nav grouped (Operasi · Member & kartu · Loyalty · Komunitas · Sistem) with group labels in `ktm-label`; one unique Lucide icon per item; active = white/10 fill + gold icon. Mobile: band top bar + drawer. |
| **Tab bar** (app) | See NATIVE-DESIGN.md: band-coloured bar, cream inactive icons at 70%, active = cream + 3 px gold indicator above the icon, centre "KTM" item in maroon. |
| **Icons** | Lucide, outline, stroke 1.75 (2 small), 16 in controls, 20 in wells. No emoji. |
| **Browser surfaces** | Selection = gold on navy text; caret and `accent-color` from tokens; scrollbars `borderStrong`; link underline offset 3 px; native pickers follow the scheme. |

## 7. Surfaces

| Surface | Mode | Composition |
|---|---|---|
| `/login`, 404 | Persuade-light | `AuthFrame`: band header (mobile) or band panel with crest 72 + cream lockup (desktop), gold rule; paper side with the form card; varsity title. |
| `/join` | Persuade | Band header + varsity hero, the **live KTM preview** filling as the member types (name, drink, genre), then the form; success = their card. |
| `/c/<token>` (digital ID) | Persuade | The KTM (flip), live status badge (Active member / Card deactivated), city, member since, member photo for face-matching. **Never** NIM, email, phone, song or quote. App download block. `noindex`. |
| Dashboard | Operate | Band sidebar, paper ground, varsity page title on the gold rule, Tabs for sub-views, tables/cards in Figtree. |
| Print | — | `card-templates/ktm-2026`: the official artwork + values + white QR in the maroon tile; back = official back. |

## 8. Card print files

| Rule | Value |
|---|---|
| Template | `apps/web/card-templates/ktm-2026/` (default). `placeholder/` kept for tests only |
| Page | 91.6 × 60 mm = CR80 85.6 × 54 mm + 3 mm bleed; TrimBox/BleedBox set |
| Safe area | 4 mm inside trim |
| Printed data | **Name, favorite drink, favorite genre, QR.** No NIM. Song and quote stay digital |
| Values | The card-value font (`packages/shared/assets/fonts/card-value.ttf`), embedded (Avenir Black); #000, caps, −0.065 em |
| QR | White modules on the maroon tile, EC M, ≥ 18 mm; scan-tested before a vendor run |
| Raster art | ≥ 300 dpi at printed size (`front.jpg`/`back.jpg` are 1440 px ≈ 400 dpi) |

## 9. Copy and formatting

- All strings in `packages/shared/src/i18n/{en,id}.ts`; a test fails when a key exists in only one. Indonesian is the default and uses "kamu" for members.
- Sentence case for UI copy; CAPS only via `ktm-label`, badges, tabs and the varsity/KTM faces (CSS `uppercase`, never typed in caps).
- Numbers only via `packages/shared/src/format.ts`: `3.800`, `Rp 6.000.000`, `14 Okt`, `19.30 WIB`, inputs `14/10/2026`.
- Errors say what happened and what to do. No raw codes.
- Code comments in English.

## 10. Craft checklist (every screen, before `dev`)

1. Nothing clipped or overlapping at 360/390 and 1440, in ID **and** EN.
2. Light and dark both checked; the band is navy in both.
3. Empty, loading, error states with a next step.
4. Visible focus (web), touch ≥ 44 (app).
5. One varsity line max; gold only as rules; maroon only for the card action and count chips.
6. Lucide icons, one per meaning.
7. Numbers, money, dates through the helpers; inputs day-first, 24 h.
8. Forms: labels tied, errors announced, first invalid field focused, Enter submits.
9. Destructive actions confirm with a danger button that says what happens.
10. The logo is the untouched full crest; the KTM matches the printed card.
