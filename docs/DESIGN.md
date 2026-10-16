# PATS University — Design

Version 1.1, 16 Oct 2026 (brand colours and crest from the official logo). Applies to the HQ dashboard, the public `/join` page, the Expo app and transactional emails.

**Bar:** Notion/Linear-grade polish, in the NEXUS visual language (PRODUCT.md §5.4), coloured by the PATS crest. This means calm warm neutrals, one brand accent (navy) and clear hierarchy. Nothing may be clipped, and every screen has empty, loading and error states.

## 1. Where the tokens live

All design values are defined **once**, in [`packages/shared/src/tokens.ts`](../packages/shared/src/tokens.ts):

| Consumer | How it reads tokens |
|---|---|
| Web (`apps/web`) | The root layout injects `toCssVariables()` as `--pats-*` CSS variables (light, dark via `prefers-color-scheme`, and a forced theme via `data-theme`). [`globals.css`](../apps/web/src/app/globals.css) maps them onto Tailwind's theme, which is where utilities like `bg-surface`, `text-muted`, `rounded-control`, `text-title1` and `h-control-lg` come from. |
| App (`apps/mobile`) | It imports the same objects through `src/theme` (`useColors()`, `textStyle()`, `space`, `radius`, `size`). |
| Email | Templates in `apps/web/src/lib/email/templates.ts` inline the light colours. |
| App config | `app.config.ts` reads the splash background (`bg`) and the adaptive-icon background (`brand.cream`) from [`colors.json`](../packages/shared/src/colors.json). |

Rule: **no raw colour, font size, radius or spacing in components.** If a value is missing, add a token first. NEXUS's conventions are kept on purpose: the token names map 1:1 to NEXUS's (`apps/web/src/styles.css`, `Theme.swift`, `Theme.kt`). A screen that looks right in NEXUS will therefore look right here.

## 2. Colour

The palette comes from the official crest (`~/pats-univ-brand/pats-crest-9000.png`). It replaces the NEXUS violet. Three brand colours are sampled from it and exported as `brand` in `tokens.ts`:

| Brand | Hex | In the crest | In the UI |
|---|---|---|---|
| Navy | `#001836` | Shield quadrants, lettering | **Primary and accent** in light mode: primary buttons, focus ring, selection, links, accent badges. Dark mode uses lighter navy tints (`#a9c3eb` fill, `#8aacdf` ring), because the crest navy disappears on a dark background. |
| Maroon | `#360c0c` | Outlines, the cap | **Secondary** accent (`secondary*` tokens) for brand highlights. **Never for errors**: errors keep a real red (`danger*`). |
| Cream | `#fcead8` | The scroll, light quadrants | The **warm surface tint**: the light `bg` and the muted surfaces are cream tints, and the icon backgrounds use cream itself. Cream is never body text: text stays a neutral near-black (light) or near-white (dark). |

Brand and status colours are kept apart. Success, warning and danger are the same green, amber and red as before. Only the text tones were darkened where they missed 4.5:1. They never borrow navy or maroon, so a status always reads as a status.

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#fdf6ed` | `#0a1220` | App background (cream tint / navy-black) |
| `surface` | `#ffffff` | `#111a2b` | Cards, inputs, sheets |
| `surfaceMuted` | `#f9efe3` | `#172238` | Table headers, chips, icon wells, active nav item |
| `surfaceHover` | `#f5e8d9` | `#1d2a43` | Row and ghost-button hover |
| `border` | `#eee2d4` | `#243149` | Hairlines, card borders |
| `borderStrong` | `#dccdbb` | `#35425c` | Input borders |
| `text` | `#23262d` | `#e8ebf0` | Primary text |
| `textMuted` | `#5d6370` | `#9ca6b6` | Secondary text |
| `placeholder` | `#70747e` | `#7e8899` | Placeholders only |
| `primary` / `primaryText` | `#001836` / `#ffffff` | `#a9c3eb` / `#001836` | Primary buttons, the KTM card |
| `accent` | `#001836` | `#8aacdf` | Focus ring, checkbox, selection |
| `accentText` | `#001836` | `#a9c3eb` | Accent as text (links) |
| `accentSubtle` / `accentSubtleText` | `#e6ebf3` / `#001836` | `#16284a` / `#bcd0f0` | Info alerts, accent badges, avatars, text selection |
| `secondary` / `secondaryText` | `#360c0c` / `#ffffff` | `#e2b4ac` / `#360c0c` | Maroon brand fill (sparingly) |
| `secondarySubtle` / `secondarySubtleText` | `#f6e4e0` / `#360c0c` | `#2e1a1e` / `#ebc4bd` | Maroon chips and highlights |
| `success*`, `warning*` | see file | see file | Status badges, alerts |
| `danger*` | `#ef4444`, text `#c42121`, solid `#dc2626` | `#f87171`, solid `#dc2626` | Errors, destructive buttons (`dangerSolid`) |

### Contrast (WCAG 2.x AA)

Every text/background pair the components use. Text needs 4.5:1. Placeholders are held to the same 4.5:1 here, even though WCAG exempts them. Non-text UI (focus ring, primary button edge) needs 3:1. The test `packages/shared/test/shared.test.ts` recomputes all of these and fails the build if a token change drops one below its threshold.

| Foreground on background | Light | Dark | Needs |
|---|---|---|---|
| `text` on `bg` | 14.12 | 15.69 | 4.5 |
| `text` on `surface` | 15.14 | 14.57 | 4.5 |
| `text` on `surfaceMuted` | 13.33 | 13.29 | 4.5 |
| `text` on `surfaceHover` | 12.57 | 12.00 | 4.5 |
| `textMuted` on `bg` | 5.62 | 7.63 | 4.5 |
| `textMuted` on `surface` | 6.03 | 7.08 | 4.5 |
| `textMuted` on `surfaceMuted` | 5.31 | 6.46 | 4.5 |
| `textMuted` on `surfaceHover` | 5.00 | 5.83 | 4.5 |
| `placeholder` on `surface` | 4.68 | 4.86 | 4.5 |
| `primaryText` on `primary` | 17.74 | 9.88 | 4.5 |
| `accentText` on `bg` | 16.54 | 10.44 | 4.5 |
| `accentText` on `surface` | 17.74 | 9.69 | 4.5 |
| `accentSubtleText` on `accentSubtle` | 14.82 | 9.34 | 4.5 |
| `secondaryText` on `secondary` | 17.29 | 9.35 | 4.5 |
| `secondarySubtleText` on `secondarySubtle` | 14.07 | 10.26 | 4.5 |
| `successText` on `successSubtle` | 4.76 | 8.77 | 4.5 |
| `successText` on `surface` | 5.02 | 9.99 | 4.5 |
| `warningText` on `warningSubtle` | 4.75 | 9.14 | 4.5 |
| `warningText` on `surface` | 5.02 | 10.43 | 4.5 |
| `dangerText` on `dangerSubtle` | 5.35 | 6.08 | 4.5 |
| `dangerText` on `surface` | 5.86 | 6.29 | 4.5 |
| `dangerText` on `bg` | 5.46 | 6.78 | 4.5 |
| `onSolid` on `dangerSolid` | 4.83 | 4.83 | 4.5 |
| `accent` on `surface` (non-text) | 17.74 | 7.50 | 3 |
| `accent` on `bg` (non-text) | 16.54 | 8.08 | 3 |
| `primary` on `surface` (non-text) | 17.74 | 9.69 | 3 |
| `primary` on `bg` (non-text) | 16.54 | 10.44 | 3 |

Status colour is **meaning**, never decoration. Card status badges, for example, run:

| Status | Badge colour |
|---|---|
| `NOT_PRINTED` | neutral |
| `IN_BATCH`, `SENT_TO_VENDOR`, `RECEIVED_HQ` | accent |
| `ENCODED` | warning |
| `DELIVERED` | success |
| `REVOKED` | danger |

## 3. Type

- **Fonts:** Plus Jakarta Sans (display, 600–800) for page titles and stat numbers; Inter (400–700) for everything else.
  - Web loads both with `next/font`.
  - The app loads them with `@expo-google-fonts`.
  - React Native selects a font by file, not by weight: `textStyle()` maps each weight to its file.
- **Scale (px/dp):**

  | Style | Size / line height | Weight | Tracking |
  |---|---|---|---|
  | `display` | 32/40 | 800 | −2% |
  | `title1` (page titles) | 26/32 | 700 | −1.5% |
  | `title2` | 20/28 | 700 | — |
  | `title3` (card titles) | 17/24 | 600 | — |
  | `bodyLg` | 16/24 | — | — |
  | `body` | 15/22 | — | — |
  | `bodySm` (dashboard default) | 14/20 | — | — |
  | `caption` (meta) | 13/18 | — | — |
  | `label` (section labels) | 11/16 | 600 | +4%, uppercase |

- Numbers in tables, NIMs and counters use `tabular-nums`.
- App text caps Dynamic Type at 1.4× (`maxFontSizeMultiplier`). This lets large text grow without breaking layouts.

## 4. Space, radius, size, motion

- **Spacing:** a 4-pt scale (`space[1]` = 4 … `space[16]` = 64).
  - Page gutters are 16 on mobile and 24–40 on the dashboard.
  - Cards pad 20 (web) or 16 (app).
  - Gaps between form fields are 16.
- **Radius:**

  | Token | Value | Use |
  |---|---|---|
  | `sm` | 8 | Nav items, small chips |
  | `control` | 12 | Inputs, buttons |
  | `card` | 20 | Cards, dialogs, the KTM |
  | `pill` | — | Badges, avatars |

- **Control heights:** 32 / 40 / 48. Primary form actions use 48 (`lg`). The minimum touch target in the app is 44.
- **Layout widths:**
  - Sidebar: 248
  - Dashboard content: max 1120
  - Forms (`/join`, `/login`): max 440
- **Motion:**
  - Durations are 150 ms (hover/press), 200 ms and 300 ms (enter), all on `cubic-bezier(0.2, 0, 0, 1)`.
  - Buttons scale to 0.98 on press. Pages fade up 8 px when they enter.
  - `prefers-reduced-motion` turns all of it off.

## 5. Components

Web components are in `apps/web/src/components/ui` and the app's are in `apps/mobile/src/components`. Both platforms have the same set, with the same names where possible.

| Component | Rules |
|---|---|
| Button | Variants: primary (navy), secondary (surface + border + soft shadow), ghost, danger. Labels are sentence case, never truncated (`whitespace-nowrap`; size the container instead). A button that is loading shows a spinner and keeps its width. |
| Input / Select / Textarea | 48 high and 12 radius. Border is `borderStrong`, turning accent on focus, with a 4 px accent ring at 15%. Labels sit above in 14/500. Hints and errors go below in caption, and an error replaces the hint. |
| OTP input | Six boxes over one real input. This keeps paste, `one-time-code` autofill and screen readers working, and it auto-submits on the 6th digit. |
| Card | `surface`, 1 px `border`, 20 radius, and the soft shadow (web). |
| Badge | 24 high, pill-shaped, with an optional status dot. Badges are the only place status colours appear as fills. |
| Empty state | A 44 px muted icon well, then a title (why it's empty), one line of body (what happens next or what to do), and at most one action. No dashed boxes and no illustrations. |
| Dialog | Web uses the platform `<dialog>`, which gives focus trap, Esc and the backdrop. The app uses `Alert.alert` for confirmations. A destructive confirm uses the danger button and says exactly what happens. |
| Page header (dashboard) | Left-aligned title1, then the muted description (max 2 lines), actions on the right, and a hairline below. |
| Table (dashboard) | Header row 40 on `surfaceMuted`; body rows 56. Secondary columns hide at small widths. A table scrolls inside its card, never the page. The row's primary link covers the whole row. |
| Icons | One set: **Lucide** (`lucide-react` / `lucide-react-native`), outline, stroke 1.75 (2 for small status icons), sized 16 in controls and 20 in wells. No emoji as icons. |

## 6. Brand assets

The crest master (9000 px) is **not** in the repo. [`tools/brand/make-assets.sh`](../tools/brand/make-assets.sh) regenerates every size from it. `sips` does the cropping and resizing; Pillow only masks the shield and centres it on a canvas. The art is never redrawn or recoloured.

| Asset | File | Content |
|---|---|---|
| App icon | `apps/mobile/assets/icon.png` (1024, no alpha) | The shield only, on cream. The full crest's small text blurs at icon size. |
| Android adaptive icon | `apps/mobile/assets/adaptive-icon.png` (1024, transparent) | The shield, inside the 66% safe circle. The background colour is `brand.cream` in `app.config.ts`. |
| Splash | `apps/mobile/assets/splash-icon.png` (1024) | The full crest at 200 pt, the same art on the light `bg` and the dark `bg` |
| Favicons | `apps/web/public/favicon-32.png`, `icon-192.png`, `apple-touch-icon.png` (cream, no alpha); `apps/mobile/assets/favicon.png` | The shield |
| Header crest | `apps/web/public/brand/crest-{80,120,160,240}.png` | `Wordmark` shows the crest at `size.crest` (40 px). It uses `srcset`, so it stays crisp from 1× to 6×. |

The crest replaces the text wordmark on the web (dashboard header, `/join`, `/login`). Its alt text is the name, "PATS University". Never place the crest on a busy or saturated background: it already carries its own white halo.

## 7. Copy and formatting

- Every string is in `packages/shared/src/i18n/{en,id}.ts`. A test fails when a key exists in only one language. Indonesian is the default and uses "kamu" for members.
- Code comments are in English.
- Sentence case everywhere: no Title Case buttons and no ALL CAPS, except `label` section headings.
- Numbers come only through the helpers in `packages/shared/src/format.ts`:

  | Kind | Example |
  |---|---|
  | Count | `3.800` |
  | Money | `Rp 6.000.000` |
  | Date | `14 Oct` / `14 Okt`; the year appears only when it isn't the current year |
  | Time | `19.30 WIB` |

  Dates and times always use the city's time zone.
- Error messages say what happened **and** what to do ("This code has expired. Request a new one."). Never show raw codes or stack traces.

## 8. Craft checklist (run on every screen before merging to `dev`)

1. No clipped or overlapping text at 360 px and at 1440 px, in ID **and** EN (Indonesian runs ~20% longer).
2. Light and dark both checked; no hard-coded colour.
3. Empty, loading and error states exist and offer a next step.
4. Every interactive element has a visible focus state (web) and a touch target of at least 44 (app).
5. Icons come from Lucide, at one stroke width, optically centred with their text.
6. Numbers and dates go through the shared helpers.
7. Forms: labels are tied to their inputs, errors are announced (`role="alert"` / live region), the first invalid field gets focus, and Enter submits.
8. Destructive actions confirm through the platform dialog.
9. Copy exists in both languages and is sentence case, with no placeholder lorem.
10. A screen works on the user's real path: the web in the browser, the app on a simulator or device.
