/**
 * Remote-config keys (PRODUCT.md §9). Every rule the apps read at runtime is declared here once:
 * its default, which scopes may override it, how it is edited and validated. Values marked `tbd`
 * are placeholders the team has not decided yet (PRODUCT.md §12).
 */
import { z } from 'zod';

export type SettingScopeName = 'GLOBAL' | 'CITY' | 'EVENT';

export type SettingGroup =
  | 'membership'
  | 'checkIn'
  | 'xp'
  | 'leaderboard'
  | 'promoter'
  | 'roaming'
  | 'notifications'
  | 'hub'
  | 'app';

/** `toggle` = a 0/1 rule the dashboard edits as an on/off switch. */
type Unit = 'months' | 'rupiah' | 'slots' | 'requests' | 'days' | 'mb' | 'years' | 'xp' | 'minutes' | 'seconds' | 'hours' | 'percent' | 'ranks' | 'admins' | 'toggle';

interface Base<T> {
  group: SettingGroup;
  scopes: readonly SettingScopeName[];
  default: T;
  tbd?: boolean;
}

export type SettingDefinition =
  | (Base<number> & { kind: 'int'; min: number; max: number; unit: Unit })
  | (Base<string> & { kind: 'enum'; options: readonly { value: string; labelKey: string }[] })
  | (Base<string> & { kind: 'time' })
  | (Base<string> & { kind: 'url' });

export const SETTINGS = {
  minAge: { group: 'membership', kind: 'int', min: 13, max: 99, unit: 'years', default: 18, scopes: ['GLOBAL'], tbd: true },
  checkInOpensBeforeMinutes: { group: 'checkIn', kind: 'int', min: 0, max: 720, unit: 'minutes', default: 60, scopes: ['GLOBAL', 'EVENT'] },
  appQrTtlSeconds: { group: 'checkIn', kind: 'int', min: 30, max: 60, unit: 'seconds', default: 45, scopes: ['GLOBAL'] },
  welcomeBonusXp: { group: 'xp', kind: 'int', min: 0, max: 100000, unit: 'xp', default: 100, scopes: ['GLOBAL'] },
  reservationBonusXp: { group: 'xp', kind: 'int', min: 0, max: 100000, unit: 'xp', default: 25, scopes: ['GLOBAL', 'CITY'] },
  /** Blast poster: XP for an approved share proof (owner, 22 Oct 2026). */
  posterShareXp: { group: 'xp', kind: 'int', min: 0, max: 100000, unit: 'xp', default: 2, scopes: ['GLOBAL', 'CITY'] },
  xpExpiryMonths: { group: 'xp', kind: 'int', min: 1, max: 120, unit: 'months', default: 18, scopes: ['GLOBAL'] },
  drawSlots: { group: 'xp', kind: 'int', min: 1, max: 100, unit: 'slots', default: 5, scopes: ['GLOBAL', 'EVENT'] },
  freeDrawExpiryMonths: { group: 'leaderboard', kind: 'int', min: 1, max: 12, unit: 'months', default: 3, scopes: ['GLOBAL'] },
  regionalAdminLimit: { group: 'membership', kind: 'int', min: 1, max: 100, unit: 'admins', default: 5, scopes: ['GLOBAL', 'CITY'] },
  cardReplacementFee: { group: 'membership', kind: 'int', min: 0, max: 2000000000, unit: 'rupiah', default: 100000, scopes: ['GLOBAL'] },
  memberClaimAllowGl: { group: 'promoter', kind: 'int', min: 0, max: 1, unit: 'toggle', default: 0, scopes: ['GLOBAL'] },
  memberBonusPerGuestXp: { group: 'promoter', kind: 'int', min: 0, max: 10000, unit: 'xp', default: 5, scopes: ['GLOBAL', 'CITY'] },
  memberBonusPerReservationXp: { group: 'promoter', kind: 'int', min: 0, max: 10000, unit: 'xp', default: 25, scopes: ['GLOBAL', 'CITY'] },
  promoterBonusPerReservationXp: { group: 'promoter', kind: 'int', min: 0, max: 10000, unit: 'xp', default: 25, scopes: ['GLOBAL', 'CITY'] },
  xpPerCheckIn: { group: 'xp', kind: 'int', min: 0, max: 10_000, unit: 'xp', default: 50, scopes: ['GLOBAL', 'CITY'] },
  spinCostXp: { group: 'xp', kind: 'int', min: 0, max: 100_000, unit: 'xp', default: 250, scopes: ['GLOBAL'] },
  maxSpinsPerEvent: { group: 'xp', kind: 'int', min: 0, unit: 'slots', default: 1, max: 1, scopes: ['GLOBAL', 'EVENT'] },
  redeemCodeTtlMinutes: { group: 'xp', kind: 'int', min: 1, max: 1440, unit: 'minutes', default: 15, scopes: ['GLOBAL'] },
  leaderboardPeriod: {
    group: 'leaderboard',
    kind: 'enum',
    options: [
      { value: 'QUARTERLY', labelKey: 'settings.periodQuarterly' },
      { value: 'MONTHLY', labelKey: 'settings.periodMonthly' },
      { value: 'EVENT', labelKey: 'settings.periodEvent' },
      { value: 'ALL_TIME', labelKey: 'settings.periodAllTime' },
    ],
    default: 'QUARTERLY',
    scopes: ['GLOBAL'],
  },
  leaderboardTopN: { group: 'leaderboard', kind: 'int', min: 3, max: 500, unit: 'ranks', default: 50, scopes: ['GLOBAL'] },
  promoterBonusKind: {
    group: 'promoter',
    kind: 'enum',
    options: [
      { value: 'XP', labelKey: 'settings.bonusXp' },
    ],
    default: 'XP',
    scopes: ['GLOBAL'],
  },
  promoterBonusPerGuestXp: { group: 'promoter', kind: 'int', min: 0, max: 10_000, unit: 'xp', default: 5, scopes: ['GLOBAL', 'CITY'] },
  hubTimelinePosting: { group: 'hub', kind: 'enum', options: [{ value: 'HQ', labelKey: 'social.hqApprover' }], default: 'HQ', scopes: ['GLOBAL', 'CITY'] },
  hubHistoryDays: { group: 'hub', kind: 'int', min: 1, max: 30, unit: 'days', default: 30, scopes: ['GLOBAL'] },
  hubMediaMaxSeconds: { group: 'hub', kind: 'int', min: 1, max: 60, unit: 'seconds', default: 60, scopes: ['GLOBAL'], tbd: true },
  hubMediaMaxMb: { group: 'hub', kind: 'int', min: 1, max: 25, unit: 'mb', default: 25, scopes: ['GLOBAL'], tbd: true },
  reservationApprover: { group: 'hub', kind: 'enum', options: [{ value: 'REGIONAL_ADMIN', labelKey: 'social.cityApprover' }], default: 'REGIONAL_ADMIN', scopes: ['GLOBAL', 'CITY'] },
  roamingMaxPerMonth: { group: 'roaming', kind: 'int', min: 0, max: 100, unit: 'requests', default: 0, scopes: ['GLOBAL'] },
  roamingHubExpiryHours: { group: 'roaming', kind: 'int', min: 1, max: 720, unit: 'hours', default: 48, scopes: ['GLOBAL'] },
  reminderTime: { group: 'notifications', kind: 'time', default: '10:00', scopes: ['GLOBAL', 'CITY'] },
  followUpTime: { group: 'notifications', kind: 'time', default: '12:00', scopes: ['GLOBAL', 'CITY'] },
  appStoreUrl: { group: 'app', kind: 'url', default: '', scopes: ['GLOBAL'] },
  playStoreUrl: { group: 'app', kind: 'url', default: '', scopes: ['GLOBAL'] },
} as const satisfies Record<string, SettingDefinition>;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = (typeof SETTINGS)[K]['default'] extends number ? number : string;

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export const SETTING_GROUPS: readonly SettingGroup[] = [
  'membership',
  'checkIn',
  'xp',
  'leaderboard',
  'promoter',
  'roaming',
  'hub',
  'notifications',
  'app',
];

export function isSettingKey(key: string): key is SettingKey {
  return key in SETTINGS;
}

/** Validator for one key's value; error messages are i18n keys. */
export function settingValueSchema(key: SettingKey): z.ZodType<number | string> {
  const def: SettingDefinition = SETTINGS[key];
  switch (def.kind) {
    case 'int':
      return z.preprocess(
        // An empty field must not coerce to 0.
        (v) => (v === '' || v === null ? undefined : v),
        z.coerce
          .number('validation.numberInvalid')
          .int('validation.numberInvalid')
          .min(def.min, 'validation.numberRange')
          .max(def.max, 'validation.numberRange'),
      );
    case 'enum':
      return z.enum(def.options.map((o) => o.value) as [string, ...string[]]);
    case 'time':
      return z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'validation.timeInvalid');
    case 'url':
      return z.union([z.literal(''), z.url({ protocol: /^https$/, error: 'validation.urlInvalid' })]);
  }
}

/** Primary key of a Setting row. */
export function settingId(key: SettingKey, scope: SettingScopeName = 'GLOBAL', scopeId = ''): string {
  return `${scope}:${scopeId}:${key}`;
}
