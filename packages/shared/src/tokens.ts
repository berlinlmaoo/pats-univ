/**
 * Design tokens: the single source of truth for colour, type, radius, spacing and motion.
 * Consumed by the web dashboard (as CSS variables, see `toCssVariables`) and by the Expo app
 * (as plain values, see apps/mobile/src/theme). Values follow the NEXUS visual language:
 * calm neutrals, a near-black primary action, and one violet accent. See docs/DESIGN.md.
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
  /** Placeholder text only (never for content). */
  placeholder: string;
  /** Primary action fill (onyx in light, near-white in dark). */
  primary: string;
  /** Text and icons on top of `primary`. */
  primaryText: string;
  /** The single accent: focus rings, selection, switches, links. */
  accent: string;
  /** Accent used as text on surface (contrast-safe). */
  accentText: string;
  /** Tinted background for accent chips and selected rows. */
  accentSubtle: string;
  /** Text on `accentSubtle`. */
  accentSubtleText: string;
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
export const colors: Record<ColorScheme, ColorTokens> = palette;

export const fonts = {
  /** Headings, numbers in stat tiles, the wordmark. */
  display: 'Plus Jakarta Sans',
  /** Everything else. */
  body: 'Inter',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
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
  display: { size: 32, lineHeight: 40, weight: 800, tracking: -0.02, family: 'display' },
  title1: { size: 26, lineHeight: 32, weight: 700, tracking: -0.015, family: 'display' },
  title2: { size: 20, lineHeight: 28, weight: 700, tracking: -0.01, family: 'display' },
  title3: { size: 17, lineHeight: 24, weight: 600, tracking: -0.005, family: 'body' },
  bodyLg: { size: 16, lineHeight: 24, weight: 400, tracking: 0, family: 'body' },
  body: { size: 15, lineHeight: 22, weight: 400, tracking: 0, family: 'body' },
  bodySm: { size: 14, lineHeight: 20, weight: 400, tracking: 0, family: 'body' },
  caption: { size: 13, lineHeight: 18, weight: 400, tracking: 0, family: 'body' },
  label: { size: 11, lineHeight: 16, weight: 600, tracking: 0.04, family: 'body' },
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

export const radius = {
  sm: 8,
  /** Inputs, buttons, segmented controls. */
  control: 12,
  /** Cards, panels, sheets. */
  card: 20,
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
  logoMark: 28,
  /** App tab bar, excluding the home-indicator inset. */
  tabBar: 66,
  sidebar: 248,
  contentMax: 1120,
  formMax: 440,
} as const;

export const motion = {
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
    soft: '0 1px 2px rgba(17, 24, 39, 0.04), 0 4px 16px rgba(17, 24, 39, 0.04)',
    pop: '0 8px 32px rgba(17, 24, 39, 0.1)',
  },
  dark: {
    soft: '0 1px 2px rgba(0, 0, 0, 0.3)',
    pop: '0 8px 32px rgba(0, 0, 0, 0.5)',
  },
} as const;

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function colorVars(scheme: ColorScheme): string {
  const c = colors[scheme];
  const lines = Object.entries(c).map(([k, v]) => `--pats-${kebab(k)}:${v};`);
  lines.push(`--pats-shadow-soft:${shadow[scheme].soft};`, `--pats-shadow-pop:${shadow[scheme].pop};`);
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
  ].join('');
  const typeVars = Object.entries(type)
    .map(
      ([k, t]) =>
        `--pats-text-${kebab(k)}:${t.size}px;--pats-text-${kebab(k)}-lh:${t.lineHeight}px;` +
        `--pats-text-${kebab(k)}-weight:${t.weight};--pats-text-${kebab(k)}-tracking:${t.tracking}em;`,
    )
    .join('');
  return (
    `:root{${scale}${typeVars}${colorVars('light')}}` +
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${colorVars('dark')}}}` +
    `:root[data-theme="dark"]{${colorVars('dark')}}`
  );
}
