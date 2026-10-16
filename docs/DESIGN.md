# PATS University — Design

Version 1.0, 16 Oct 2026. Applies to the HQ dashboard, the public `/join` page, the Expo app and transactional emails.

**Bar:** Notion/Linear-grade polish, in the NEXUS visual language (PRODUCT.md §5.4). This means calm neutrals, one accent and clear hierarchy. Nothing may be clipped, and every screen has empty, loading and error states.

## 1. Where the tokens live

All design values are defined **once**, in [`packages/shared/src/tokens.ts`](../packages/shared/src/tokens.ts):

| Consumer | How it reads tokens |
|---|---|
| Web (`apps/web`) | The root layout injects `toCssVariables()` as `--pats-*` CSS variables (light, dark via `prefers-color-scheme`, and a forced theme via `data-theme`). [`globals.css`](../apps/web/src/app/globals.css) maps them onto Tailwind's theme, which is where utilities like `bg-surface`, `text-muted`, `rounded-control`, `text-title1` and `h-control-lg` come from. |
| App (`apps/mobile`) | It imports the same objects through `src/theme` (`useColors()`, `textStyle()`, `space`, `radius`, `size`). |
| Email | Templates in `apps/web/src/lib/email/templates.ts` inline the light colours. |
| App config | `app.config.ts` reads the splash and adaptive-icon background colours from tokens. |

Rule: **no raw colour, font size, radius or spacing in components.** If a value is missing, add a token first. NEXUS's conventions are kept on purpose: the token names map 1:1 to NEXUS's (`apps/web/src/styles.css`, `Theme.swift`, `Theme.kt`). A screen that looks right in NEXUS will therefore look right here.

## 2. Colour

One accent: **violet `#7b68ee`** (dark mode `#8b7bf0`), the NEXUS accent. The primary action is **onyx**, not violet. This keeps the accent rare, so it means "focus / selected / link".

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#f8f9fb` | `#11141b` | App background |
| `surface` | `#ffffff` | `#181c25` | Cards, inputs, sheets |
| `surfaceMuted` | `#f1f3f6` | `#1f242e` | Table headers, chips, icon wells |
| `surfaceHover` | `#eef0f4` | `#252b37` | Row and ghost-button hover |
| `border` | `#e6e8ec` | `#2a2f3a` | Hairlines, card borders |
| `borderStrong` | `#d3d7de` | `#3a414f` | Input borders |
| `text` | `#292d34` | `#e6e8ec` | Primary text |
| `textMuted` | `#656d76` | `#9aa1ad` | Secondary text (≥ 4.5:1 on surface) |
| `placeholder` | `#9aa1ab` | `#6b7381` | Placeholders only |
| `primary` / `primaryText` | `#202023` / `#fff` | `#e6e8ec` / `#11141b` | Primary buttons, the KTM card |
| `accent` | `#7b68ee` | `#8b7bf0` | Focus ring, checkbox, selection |
| `accentText` | `#6247d6` | `#b3a6ff` | Accent as text (links, eyebrows) |
| `accentSubtle` / `accentSubtleText` | `#f1eefe` / `#6750cf` | `#2a2546` / `#b9acff` | Info alerts, accent badges, avatars |
| `success*`, `warning*`, `danger*` | see file | see file | Status badges, alerts, destructive buttons (`dangerSolid`) |

Status colour is **meaning**, never decoration. Card status badges, for example, run:

| Status | Badge colour |
|---|---|
| `NOT_PRINTED` | neutral |
| `IN_BATCH`, `SENT_TO_VENDOR`, `RECEIVED_HQ` | accent |
| `ENCODED` | warning |
| `DELIVERED` | success |
| `REVOKED` | danger |

## 3. Type

- **Fonts:** Plus Jakarta Sans (display, 600–800) for page titles, stat numbers and the wordmark; Inter (400–700) for everything else.
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
| Button | Variants: primary (onyx), secondary (surface + border + soft shadow), ghost, danger. Labels are sentence case, never truncated (`whitespace-nowrap`; size the container instead). A button that is loading shows a spinner and keeps its width. |
| Input / Select / Textarea | 48 high and 12 radius. Border is `borderStrong`, turning accent on focus, with a 4 px accent ring at 15%. Labels sit above in 14/500. Hints and errors go below in caption, and an error replaces the hint. |
| OTP input | Six boxes over one real input. This keeps paste, `one-time-code` autofill and screen readers working, and it auto-submits on the 6th digit. |
| Card | `surface`, 1 px `border`, 20 radius, and the soft shadow (web). |
| Badge | 24 high, pill-shaped, with an optional status dot. Badges are the only place status colours appear as fills. |
| Empty state | A 44 px muted icon well, then a title (why it's empty), one line of body (what happens next or what to do), and at most one action. No dashed boxes and no illustrations. |
| Dialog | Web uses the platform `<dialog>`, which gives focus trap, Esc and the backdrop. The app uses `Alert.alert` for confirmations. A destructive confirm uses the danger button and says exactly what happens. |
| Page header (dashboard) | Left-aligned title1, then the muted description (max 2 lines), actions on the right, and a hairline below. |
| Table (dashboard) | Header row 40 on `surfaceMuted`; body rows 56. Secondary columns hide at small widths. A table scrolls inside its card, never the page. The row's primary link covers the whole row. |
| Icons | One set: **Lucide** (`lucide-react` / `lucide-react-native`), outline, stroke 1.75 (2 for small status icons), sized 16 in controls and 20 in wells. No emoji as icons. |

## 6. Copy and formatting

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

## 7. Craft checklist (run on every screen before merging to `dev`)

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
