# PATS University — native design spec (iOS + Android)

For the Codex sessions on `apps/mobile` (Expo, one app for iOS and Android). Source of truth: [DESIGN.md](DESIGN.md) v2.0 (the KTM is the design). Web reference implementation: branch `feat/ktm-design` (`apps/web/src/components/ui`, `components/ktm`, `components/dashboard/shell.tsx`). Do the items in order; each is checkable.

## 0. Already done for you on `feat/ktm-design`

- `packages/shared/src/colors.json` + `tokens.ts`: new palette (paper / navy night, `gold`, `goldText`, `band`, `bandText`, `bandMuted`, `brand.{gold,paper,cardNavy,ink}`), squarer `radius` (4 / 6 / 10), `varsity` sizes, `ktm` card geometry, `fonts` names. The app already reads these through `src/theme`, so colours and radii change on rebuild with no code change. Check every screen in both schemes after pulling: dark `primary` is now **cream with navy text** (was light blue), dark `accent` is **gold**.
- `apps/mobile/assets` regenerated from the official LOGO-01 by `tools/brand/make-assets.sh` (resize/pad only): `icon.png` (1024, crest on solid navy `#001836`, no alpha), `adaptive-icon.png` (1024, crest inside the 66% safe zone, transparent), `splash-icon.png` (1024, full crest), `favicon.png`.
- `MeResponse.member.favoriteDrink` and `photoUrl` exist in `packages/shared/src/api.ts`; `/api/me` accepts `favoriteDrink` and a photo upload (see §5).

## 1. Logo, app icon, splash (Berlin's rule: the full crest, untouched)

| Item | Change |
|---|---|
| iOS app icon | `app.config.ts` → `icon: './assets/icon.png'` (already the file name). Expo generates the AppIcon set from it. Remove any shield-only art. |
| Android adaptive icon | `android.adaptiveIcon = { foregroundImage: './assets/adaptive-icon.png', backgroundColor: colors.brand.navy }` (was `brand.cream` + shield). Monochrome icon: omit until Berlin supplies a one-colour mark (LOGO-02/03 are crest one-colour files; ask before using). |
| Splash | `expo-splash-screen` image `./assets/splash-icon.png`, `imageWidth: 200`, background **light `colors.light.band` (#071935)** and **dark `colors.dark.band`** — the splash is the card header. |
| In-app wordmark (`components/wordmark.tsx`) | The full crest PNG (ship `crest@1x/2x/3x` from `apps/web/public/brand/crest-{80,160,240}.png` for 40 pt). No text wordmark, no shield. |
| Lockup | Where a "PATS UNIVERSITY" title would go on navy (login hero, KTM back), use the official cream lockup file (`apps/web/public/brand/lockup-cream-{240,480,720}.png`) as an image. Never retype it in Graduate as a logo. |

## 2. Fonts

| Face | Package / file | Use |
|---|---|---|
| Figtree 400/500/600/700/800/900 | `@expo-google-fonts/figtree` | All UI text. Replace Inter **and** Plus Jakarta in `FONT_FILES` (`body` and `display` both map to Figtree weights; add `900: 'Figtree_900Black'`). Remove `@expo-google-fonts/inter` and `plus-jakarta-sans`. |
| Graduate 400 | `@expo-google-fonts/graduate` | `varsity.*` tokens only: one line per screen (screen titles on the band, login hero, KTM screen title). `textTransform: 'uppercase'`, tracking from the token. The web draws it with a `varsityStroke` (0.045 em) stroke to match the card's heavy block; RN `Text` has no stroke, so render varsity lines with `react-native-svg` `<Text stroke={color} strokeWidth={0.045*size} fill={color} fontFamily="Graduate_400Regular">` in a `VarsityText` component (same look on iOS and Android). |
| **Card value font** | ONE file for every platform: `packages/shared/assets/fonts/card-value.ttf` (now Figtree Black; becomes licensed Avenir LT Pro Black later by replacing the file, same name). Load it with `expo-font` as `fonts.cardValue.family` ("PATS Card Value") from that path (no copy in `apps/mobile`). **Do not use iOS system Avenir**: the card must be pixel-identical on web, iOS and Android. | KTM card values only, tracking `fonts.cardValue.tracking` (−0.04 em), caps, `brand.ink`. |

Label style (`type.label`): weight 800 → use `Figtree_800ExtraBold` (900 on the KTM), **uppercase**, tracking 0.06 em. This is the card's `NAME :` label and is used for field labels, section labels (`section-label.tsx`), list headers, badges and tab labels.

## 3. Shell

| Element | iOS | Android |
|---|---|---|
| Top bar / large title area | Navy band: `backgroundColor: c.band`, title in `bandText`, 3 pt `gold` rule under the bar (a `View` with `height: 3` under the header, or `headerShadowVisible:false` + bottom border). Screen title in Graduate (`varsity.small` in the bar; `varsity.title` as large title on top-level tabs). Status bar light content. | Same band + gold rule; `StatusBar` light; edge-to-edge with the band behind the status bar. |
| Tab bar (`features/tab-options.ts`) | `backgroundColor: c.band`; inactive tint `bandMuted`; active tint `bandText`; active indicator = 3 pt gold bar above the active icon (custom `tabBarButton` or `tabBarIcon` wrapper); labels Figtree 700, 11 pt, uppercase, tracking 0.04. Member tabs order: **Home · Events · KTM · Hub · Profile** with the KTM tab icon in a maroon (`secondary`) rounded-square well. | Same; ripple `rgba(255,255,255,0.12)`. |
| Ground | `c.bg` (paper / navy night); cards `c.surface`. | same |
| Sheets & dialogs | Confirmations stay centred `.alert` (memory: no confirmationDialog). Bottom sheets get a band header with the gold rule. | `Alert.alert`; sheets same as iOS. |

## 4. The KTM screen (`features/ktm-card.tsx`, `(member)/(tabs)/card.tsx`) — must be identical to the printed card

1. Background: the official blank front. Ship `apps/web/public/ktm/front-800.webp` and `front-1600.webp` as `assets/ktm/front@2x.webp` / `@3x` (or `require` the 1600 one; RN `Image` with `resizeMode="cover"`). Card view keeps `aspectRatio: ktm.ratio` (3213/2079), corner radius `ktm.radius × width`, shadow from `shadow.light.card`.
2. Values, absolutely positioned from `ktm` (fractions of width/height): NAME at `top: ktm.nameY`, DRINK at `ktm.drinkY`, GENRE at `ktm.genreY`, `left: ktm.valueX`, font size `ktm.valueSize × cardWidth / 0.7` (cap height → em), max width `ktm.nameMaxW` / `ktm.valueMaxW`, `adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.5}`. Colour `brand.ink` (#000), uppercase, letterSpacing `fonts.cardValue.tracking × fontSize` (−0.04 em), font family `fonts.cardValue.family` on **both** platforms (the bundled `card-value.ttf`; never system Avenir), same size ratios as web. Labels are already printed in the art: do not draw them.
3. QR inside the maroon tile (`ktm.qr` box): **white modules on transparent**, EC M, quiet zone 0 (the tile is the quiet zone). The rotating check-in QR moves **into the tile** (replace the separate white QR block in `features/card-qr.tsx`; keep the progress bar under the card, `gold` fill on `surfaceMuted`). Scan-test with the crew scanner in both themes and at 30% brightness; if a phone camera fails, add a "Perbesar QR" button that shows the same code white-on-maroon full screen.
4. NIM is **not** on the card. Show NIM, favourite song and quote below the card in a `DetailList` (labels in `ktm-label` caps).
5. Flip: a "Balik kartu / Flip card" button (and tap on card) rotates Y 180° in 500 ms (`react-native-reanimated`, `backfaceVisibility: 'hidden'`) to the official back (`assets/ktm/back@2x.webp`, from `apps/web/public/ktm/back-*.webp`). Reduce Motion → 200 ms crossfade.
6. Accessibility label: "KTM PATS University: {name}, minuman favorit {drink}, genre favorit {genre}". The image itself is decorative.
7. Physical card status (`card-status.tsx`) sits under the card as a Badge row, not inside the art.

## 5. Member data

- **Favourite drink**: add to profile edit (`profile-screen.tsx`) between name and genre; validation from `packages/shared/src/validation.ts` (same rules as genre). It is printed on the card.
- **Member photo**: profile header shows the photo (square, radius 6, 72 pt) with "Ganti foto"; pick from library or camera (`expo-image-picker`, square crop UI from the picker), upload through the same endpoint as web (`/api/me/photo`, see `apps/web/src/app/api/me`), same checks (JPEG/PNG/WebP, ≤ 5 MB, ≥ 400 px). Members without a photo see an EmptyState-style prompt on Profile ("Tambah foto supaya crew bisa mencocokkan wajahmu di pintu").
- Join happens on the web (`/join`) and already asks drink + photo.

## 6. Components (`apps/mobile/src/components`) — match the web primitives

| Component | Change |
|---|---|
| `button.tsx` | Variants `primary` (c.primary/c.primaryText), `secondary` (surface + `borderStrong` 1 pt), `ghost`, `danger`, **`maroon`** (secondary/secondaryText; the one card action: "Tampilkan KTM", "Check-in", "Ambil slot"). Radius 6, Figtree 700, height 48 (min touch 44). Disabled: transparent fill, dashed `borderStrong` edge, `textMuted` — never a pale primary. Pressed: scale 0.98. |
| `field.tsx`, `date-time-field.tsx` | Label in `label` caps above; input radius 6, 1 pt `borderStrong`, focus = 2 pt `accent`. Dates **dd/mm/yyyy**, times **24 h "19.30"**, both platforms, any device locale; WIB/city zone in the label. |
| `badge.tsx` | Radius 4, 11 pt Figtree 800 uppercase, tracking 0.05; status tones unchanged. |
| `card.tsx` | Radius 10, 1 pt `border`, `shadow.soft`; optional header with a 24 × 3 gold tick above the title. |
| `section-label.tsx` | `label` caps, `textMuted`. |
| `empty-state.tsx` | Navy (`band`) square well 48, cream icon, 3 pt gold bottom edge; title (why) + one line (next step) + one button. |
| `load-state.tsx` | Skeletons in `surfaceMuted` matching the content; error = EmptyState layout with "Coba lagi". |
| `list-row.tsx`, `detail-list.tsx` | Term in `label` caps; numbers tabular (`fontVariant: ['tabular-nums']`). |
| `notice.tsx` | Tones info / success / warning / danger, radius 6. |
| `language-toggle.tsx` | On the band: white/10 track, cream active pill with navy text. |
| New `tabs.tsx` (segmented sub-views: claims Pending/History, hub Timeline/Chat/Reservasi, leaderboard Kota/Nasional) | Heavy-caps labels, gold 3 pt indicator under the active one, horizontal `ScrollView` when it does not fit, maroon count chip. One pattern for every sub-view. |
| `qr-code.tsx` | Add `tone="onTile"` (white modules, transparent) for the KTM; keep navy-on-white for reward codes. |

## 7. Screens

| Screen | Change |
|---|---|
| Login / verify | Navy band hero with the crest (72) and the cream lockup, gold rule, form on paper below; Graduate title "MASUK" / "SIGN IN". |
| Member Home / Events | Next event card first (flyer, date `Sab, 25 Okt · 21.00 WIB`, venue, check-in state badge), XP + level row (Figtree 900 numbers, gold progress), KTM shortcut = maroon button. |
| Event detail | Check-in state as a Badge + a band-coloured strip "Sudah check-in 21.14 WIB via NFC" when done; live draw empty state shows 5 outlined slots, never an empty wheel; ended events show the result summary only. |
| Rewards / leaderboard | Ranks 1–3 with gold/silver(muted)/maroon chips, XP right-aligned tabular, active period line "Q4 2026 · reset 1 Jan" in `goldText`. Copy: "slot undian", never "spin". |
| Hub | Tabs component; selected channel highlighted; empty channel = "Pilih channel untuk membaca pesan". |
| Profile | Photo, favourite drink, KTM thumbnail (no QR) linking to the KTM tab. |
| Admin tools (scan, handover, encode, claims review, reward validation) | Band header + gold rule; scanner overlay stays dark-token; result card in current scheme with photo first (face match), name, city, status. Claims review: Pending / History tabs, pending count chip on the Tools tab. |
| `c/[token]` (in-app digital ID) | Same as web `/c/<token>`: KTM front/back, status, city, member since, photo; never NIM/email/phone/song/quote. |

## 8. Copy

Strings stay in `packages/shared/src/i18n/{en,id}.ts`; new keys added on this branch are already in both languages. Indonesian default, "kamu" for members. No "spin" anywhere (draw slots). Sentence case; caps only via the label style, badges, tabs, Graduate and KTM values.

**Font rule (Berlin, 18 Oct):** the KTM values use exactly one embedded font file on web, iOS, Android and print, behind one token (`fonts.cardValue`). Swapping to licensed Avenir LT Pro Black = replacing `card-value.ttf`. Never commit macOS `.ttc` files or unlicensed fonts.

## 9. Acceptance (per platform)

1. iPhone 15/16 and a 360 dp Android, light + dark, ID + EN: nothing clipped, band navy in both schemes.
2. The KTM screen overlaid on `example-front.png` (MICHAEL WIBOWO / TEQUILA / HIPHOP, BREAKBEAT) matches within 1% of card width.
3. The crew scanner reads the white-on-maroon QR from 30 cm at 30% brightness on both platforms.
4. App icon, adaptive icon and splash show the full crest, uncropped.
5. Every date/time input is day-first and 24 h.
6. Touch targets ≥ 44, VoiceOver/TalkBack read the KTM label and status.
