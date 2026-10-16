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

type Unit = 'requests' | 'days' | 'mb' | 'years' | 'xp' | 'minutes' | 'seconds' | 'hours' | 'percent' | 'ranks' | 'spins';

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
  xpPerCheckIn: { group: 'xp', kind: 'int', min: 0, max: 10_000, unit: 'xp', default: 50, scopes: ['GLOBAL', 'CITY'], tbd: true },
  spinCostXp: { group: 'xp', kind: 'int', min: 0, max: 100_000, unit: 'xp', default: 250, scopes: ['GLOBAL'], tbd: true },
  maxSpinsPerEvent: { group: 'xp', kind: 'int', min: 0, max: 100, unit: 'spins', default: 5, scopes: ['GLOBAL', 'EVENT'], tbd: true },
  redeemCodeTtlMinutes: { group: 'xp', kind: 'int', min: 1, max: 1440, unit: 'minutes', default: 15, scopes: ['GLOBAL'] },
  leaderboardPeriod: {
    group: 'leaderboard',
    kind: 'enum',
    options: [
      { value: 'MONTHLY', labelKey: 'settings.periodMonthly' },
      { value: 'EVENT', labelKey: 'settings.periodEvent' },
      { value: 'ALL_TIME', labelKey: 'settings.periodAllTime' },
    ],
    default: 'MONTHLY',
    scopes: ['GLOBAL'],
    tbd: true,
  },
  leaderboardTopN: { group: 'leaderboard', kind: 'int', min: 3, max: 500, unit: 'ranks', default: 50, scopes: ['GLOBAL'] },
  promoterBonusKind: {
    group: 'promoter',
    kind: 'enum',
    options: [
      { value: 'XP', labelKey: 'settings.bonusXp' },
      { value: 'CASH', labelKey: 'settings.bonusCash' },
    ],
    default: 'XP',
    scopes: ['GLOBAL'],
    tbd: true,
  },
  promoterBonusPerGuestXp: { group: 'promoter', kind: 'int', min: 0, max: 10_000, unit: 'xp', default: 20, scopes: ['GLOBAL', 'CITY'], tbd: true },
  promoterCommissionPercent: { group: 'promoter', kind: 'int', min: 0, max: 100, unit: 'percent', default: 0, scopes: ['GLOBAL', 'CITY'], tbd: true },
  hubTimelinePosting: { group: 'hub', kind: 'enum', options: [{ value: 'MEMBERS', labelKey: 'social.membersPosting' }, { value: 'ADMINS', labelKey: 'social.adminsPosting' }], default: 'MEMBERS', scopes: ['GLOBAL', 'CITY'], tbd: true },
  hubHistoryDays: { group: 'hub', kind: 'int', min: 1, max: 30, unit: 'days', default: 30, scopes: ['GLOBAL'] },
  hubMediaMaxSeconds: { group: 'hub', kind: 'int', min: 1, max: 60, unit: 'seconds', default: 60, scopes: ['GLOBAL'], tbd: true },
  hubMediaMaxMb: { group: 'hub', kind: 'int', min: 1, max: 25, unit: 'mb', default: 25, scopes: ['GLOBAL'], tbd: true },
  reservationApprover: { group: 'hub', kind: 'enum', options: [{ value: 'LOCAL_ADMIN', labelKey: 'social.cityApprover' }, { value: 'SUPER_ADMIN', labelKey: 'social.hqApprover' }], default: 'LOCAL_ADMIN', scopes: ['GLOBAL', 'CITY'], tbd: true },
  reservationMaxPerEvent: { group: 'hub', kind: 'int', min: 1, max: 20, unit: 'requests', default: 1, scopes: ['GLOBAL'], tbd: true },
  roamingMaxPerMonth: { group: 'roaming', kind: 'int', min: 0, max: 100, unit: 'requests', default: 0, scopes: ['GLOBAL'], tbd: true },
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
