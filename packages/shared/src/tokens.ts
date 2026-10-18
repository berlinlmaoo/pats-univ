/**
 * Design tokens: the single source of truth for colour, type, radius, spacing and motion.
 * Consumed by the web dashboard (as CSS variables, see `toCssVariables`) and by the Expo app
 * (as plain values, see apps/mobile/src/theme). Token names follow the NEXUS conventions.
 *
 * The visual world is the official KTM (student card): navy header band with a gold rule, grey
 * paper body, black heavy-caps values, a distressed maroon tile, cream lettering on the navy back.
 * Light = the card front (paper + navy ink); dark = the card back (navy night + cream + gold).
 * Status colours stay separate from the brand. See docs/DESIGN.md.
 */

import palette from './colors.json';

export type ColorScheme = 'light' | 'dark';

export interface ColorTokens {
  /** App background behind surfaces. */
  bg: string;
  /** Cards, sheets, inputs, table rows. */
  surface: string;
  /** Quiet raised areas: table headers, hovered rows, segmented controls. */
  surfaceMuted: string;
  /** Hover/pressed fill for interactive rows and ghost buttons. */
  surfaceHover: string;
  /** Hairlines and card borders. */
  border: string;
  /** Input borders and dividers that must read as controls. */
  borderStrong: string;
  /** Primary text. */
  text: string;
  /** Secondary text: descriptions, meta, labels. Passes 4.5:1 on surface. */
  textMuted: string;
  /** Placeholder text only (never for content). Passes 4.5:1 on surface. */
  placeholder: string;
  /** Primary action fill (crest navy in light, a light navy tint in dark). */
  primary: string;
  /** Text and icons on top of `primary`. */
  primaryText: string;
  /** The brand accent (navy): focus rings, selection, switches, links. */
  accent: string;
  /** Accent used as text on surface (contrast-safe). */
  accentText: string;
  /** Tinted background for accent chips and selected rows. */
  accentSubtle: string;
  /** Text on `accentSubtle`. */
  accentSubtleText: string;
  /** Secondary brand accent (crest maroon). Never used for errors: those are `danger*`. */
  secondary: string;
  /** Text and icons on top of `secondary`. */
  secondaryText: string;
  /** Tinted background for maroon chips and highlights. */
  secondarySubtle: string;
  /** Text on `secondarySubtle`. */
  secondarySubtleText: string;
  /** The KTM's gold rule under the navy header. Decorative lines only, never text. */
  gold: string;
  /** Gold as text (contrast-safe on bg and surface). */
  goldText: string;
  /** The KTM header band: app bars, sidebar, auth headers. Navy in both schemes. */
  band: string;
  /** Text and the wordmark on `band` (cream, like the card back). */
  bandText: string;
  /** Secondary text on `band`. */
  bandMuted: string;
  success: string;
  successSubtle: string;
  successText: string;
  warning: string;
  warningSubtle: string;
  warningText: string;
  danger: string;
  dangerSubtle: string;
  dangerText: string;
  /** Fill of destructive buttons. */
  dangerSolid: string;
  /** Text on solid status fills (dangerSolid). */
  onSolid: string;
  /** Overlay behind dialogs and sheets. */
  scrim: string;
}

/** Raw palette lives in colors.json so plain Node (Expo's app.config.ts) can read it too. */
export const colors: Record<ColorScheme, ColorTokens> = { light: palette.light, dark: palette.dark };

/**
 * The three colours sampled from the official crest. Use them for brand artwork (icon and
 * splash backgrounds); UI code reads the semantic tokens in `colors` instead.
 */
export const brand: {
  navy: string;
  maroon: string;
  cream: string;
  /** Gold/tan rule on the card. */
  gold: string;
  /** The card's grey paper body. */
  paper: string;
  /** The card's header navy as printed (a hair lighter than the crest navy). */
  cardNavy: string;
  /** Card values: pure black. */
  ink: string;
} = palette.brand;

/**
 * Faces. `varsity` matches the card's collegiate slab ("PATS UNIVERSITY") and is for display only:
 * page titles, the auth/join hero and the digital ID. `cardValue` is the ONE embedded font for the
 * KTM values on every platform (packages/shared/assets/fonts/card-value.ttf = licensed Monotype
 * Avenir Black, App + Web licence held by PATS). Never a system Avenir: the card must look
 * identical on web, iOS and Android. Everything else is `body` (Figtree).
 */
export const fonts = {
  varsity: 'Graduate',
  display: 'Figtree',
  body: 'Figtree',
  cardValue: {
    /** Family name to register the file under (web @font-face / expo-font). */
    family: 'PATS Card Value',
    /** Repo path of the single font file. */
    file: 'packages/shared/assets/fonts/card-value.ttf',
    /** Letter spacing in em (fitted to example-front.png); values are always upper case, colour brand.ink. */
    tracking: -0.065,
    /** The face's cap height in em (OS/2 sCapHeight 708 / 1000): ktm.valueCap / capHeight = font size. */
    capHeight: 0.708,
    /**
     * Where the cap top sits below the top of a line-height-1 box, in em (fitted against the
     * example card, includes the round letters' overshoot). Box top = cap top − capTop × size.
     */
    capTop: 0.065,
    /** hhea ascent/descent in em (natives: a box without lineHeight puts the cap top at capTop + (ascent + descent − 1) / 2). */
    ascent: 1.084,
    descent: 0.491,
  },
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

/**
 * Varsity slab sizes (Graduate has one weight). Used sparingly: one varsity line per screen at most.
 * Always upper case, slightly open tracking, like the card header. Rendered with a stroke of
 * `varsityStroke` em in the text colour so it matches the card's heavy block lettering.
 */
export const varsityStroke = 0.045;

export const varsity = {
  hero: { size: 40, lineHeight: 44, tracking: 0.02 },
  title: { size: 28, lineHeight: 34, tracking: 0.02 },
  small: { size: 18, lineHeight: 22, tracking: 0.02 },
} as const;

/**
 * KTM card geometry, as fractions of the card artwork (3213 × 2079 px, CR80 ratio 1.5455).
 * Value boxes sit under the printed labels; the QR goes inside the maroon tile.
 */
export const ktm = {
  ratio: 3213 / 2079,
  /**
   * Value text: the text box's left edge (the glyph origin, fraction of width; the ink of "M" starts
   * at 0.0523) and the cap height (fraction of width), measured on the example card with the card font.
   */
  valueX: 0.0492,
  valueCap: 0.0312,
  /** Cap-top of each value line (fraction of height). */
  nameY: 0.398,
  drinkY: 0.615,
  genreY: 0.831,
  /** Max width for values (fraction of width): the name clears the crest, the others clear the tile. */
  nameMaxW: 0.65,
  valueMaxW: 0.6,
  /** Maroon tile (in the artwork) and the QR inside it (fractions of width/height; the QR is square). */
  tile: { x: 0.682, y: 0.512, w: 0.275, h: 0.425 },
  qr: { x: 0.705, y: 0.549, w: 0.23 },
  /** Card corner radius as a fraction of width (the physical CR80 corner is 3.18 mm / 85.6 mm). */
  radius: 0.037,
} as const;

export interface TypeStyle {
  size: number;
  lineHeight: number;
  weight: 400 | 500 | 600 | 700 | 800;
  /** Letter spacing in em. */
  tracking: number;
  family: 'display' | 'body';
}

/** Type scale in px (web) / dp (native). */
export const type = {
  display: { size: 32, lineHeight: 38, weight: 800, tracking: -0.015, family: 'display' },
  title1: { size: 26, lineHeight: 32, weight: 800, tracking: -0.01, family: 'display' },
  title2: { size: 20, lineHeight: 26, weight: 800, tracking: -0.005, family: 'display' },
  title3: { size: 17, lineHeight: 22, weight: 700, tracking: 0, family: 'body' },
  bodyLg: { size: 16, lineHeight: 24, weight: 400, tracking: 0, family: 'body' },
  body: { size: 15, lineHeight: 22, weight: 400, tracking: 0, family: 'body' },
  bodySm: { size: 14, lineHeight: 20, weight: 400, tracking: 0, family: 'body' },
  caption: { size: 13, lineHeight: 18, weight: 400, tracking: 0, family: 'body' },
  /** The card's "NAME :" labels: heavy caps (web/Android 900, the app's heaviest file until then). */
  label: { size: 11, lineHeight: 16, weight: 800, tracking: 0.06, family: 'body' },
} as const satisfies Record<string, TypeStyle>;

export type TypeToken = keyof typeof type;

/** 4-point spacing scale. Keys are the step names used in both apps. */
export const space = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

/** Squarer than a soft SaaS: printed-card corners (the KTM's own corner is ~3 mm). */
export const radius = {
  sm: 4,
  /** Inputs, buttons, segmented controls. */
  control: 6,
  /** Cards, panels, sheets. */
  card: 10,
  pill: 9999,
} as const;

export const size = {
  controlSm: 32,
  controlMd: 40,
  controlLg: 48,
  /** Minimum touch target on mobile. */
  touch: 44,
  badge: 24,
  dot: 6,
  icon: 20,
  iconSm: 16,
  avatar: 40,
  /** Large avatar on the scan result. */
  avatarLg: 64,
  /** The member's check-in QR (needs ~220 pt to scan from arm's length). */
  qr: 224,
  /** Viewfinder square on the crew scanner. */
  scanFrame: 248,
  logoMark: 28,
  /** The crest in the web header and auth pages (files exist up to 6x this). */
  crest: 40,
  /** App tab bar, excluding the home-indicator inset. */
  tabBar: 66,
  sidebar: 248,
  contentMax: 1120,
  formMax: 440,
} as const;

export const motion = {
  wheel: 1800,
  fast: 150,
  base: 200,
  slow: 300,
  /** Standard ease-out used for every transition. */
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
  /** Pressed state scale for buttons and tappable cards. */
  pressScale: 0.98,
} as const;

export const shadow = {
  light: {
    soft: '0 1px 1px rgba(7, 25, 53, 0.06), 0 2px 6px rgba(7, 25, 53, 0.05)',
    pop: '0 12px 32px rgba(7, 25, 53, 0.18)',
    card: '0 2px 4px rgba(7, 25, 53, 0.12), 0 14px 32px rgba(7, 25, 53, 0.18)',
  },
  dark: {
    soft: '0 1px 2px rgba(0, 0, 0, 0.4)',
    pop: '0 12px 32px rgba(0, 0, 0, 0.6)',
    card: '0 2px 4px rgba(0, 0, 0, 0.5), 0 16px 40px rgba(0, 0, 0, 0.55)',
  },
} as const;

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function colorVars(scheme: ColorScheme): string {
  const c = colors[scheme];
  const lines = Object.entries(c).map(([k, v]) => `--pats-${kebab(k)}:${v};`);
  lines.push(
    `--pats-shadow-soft:${shadow[scheme].soft};`,
    `--pats-shadow-pop:${shadow[scheme].pop};`,
    `--pats-shadow-card:${shadow[scheme].card};`,
  );
  lines.push(`color-scheme:${scheme};`);
  return lines.join('');
}

/**
 * CSS custom properties for the web. Light by default, dark via `prefers-color-scheme`,
 * and either can be forced with `data-theme` on <html>.
 */
export function toCssVariables(): string {
  const scale = [
    `--pats-radius-sm:${radius.sm}px;`,
    `--pats-radius-control:${radius.control}px;`,
    `--pats-radius-card:${radius.card}px;`,
    `--pats-control-sm:${size.controlSm}px;`,
    `--pats-control-md:${size.controlMd}px;`,
    `--pats-control-lg:${size.controlLg}px;`,
    `--pats-sidebar:${size.sidebar}px;`,
    `--pats-content-max:${size.contentMax}px;`,
    `--pats-form-max:${size.formMax}px;`,
    `--pats-motion-fast:${motion.fast}ms;`,
    `--pats-motion-base:${motion.base}ms;`,
    `--pats-motion-slow:${motion.slow}ms;`,
    `--pats-ease:${motion.easing};`,
    `--pats-card-value-tracking:${fonts.cardValue.tracking}em;`,
  ].join('');
  const typeVars = Object.entries(type)
    .map(
      ([k, t]) =>
        `--pats-text-${kebab(k)}:${t.size}px;--pats-text-${kebab(k)}-lh:${t.lineHeight}px;` +
        `--pats-text-${kebab(k)}-weight:${t.weight};--pats-text-${kebab(k)}-tracking:${t.tracking}em;`,
    )
    .join('');
  const varsityVars = Object.entries(varsity)
    .map(([k, t]) => `--pats-varsity-${k}:${t.size}px;--pats-varsity-${k}-lh:${t.lineHeight}px;--pats-varsity-${k}-tracking:${t.tracking}em;`)
    .join('');
  return (
    `:root{${scale}${typeVars}${varsityVars}${colorVars('light')}}` +
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${colorVars('dark')}}}` +
    `:root[data-theme="dark"]{${colorVars('dark')}}`
  );
}
