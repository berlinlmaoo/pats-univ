import { SETTINGS, settingId, settingValueSchema, type SettingKey, type SettingValue } from '@pats/shared';
import type { Prisma, PrismaClient } from '@/generated/prisma';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Effective value of a setting: EVENT override > CITY override > GLOBAL row > code default.
 * Invalid stored values fall back to the default instead of breaking the caller.
 */
export async function getSetting<K extends SettingKey>(
  db: Db,
  key: K,
  scope: { cityId?: string | null; eventId?: string | null } = {},
): Promise<SettingValue<K>> {
  const ids = [settingId(key)];
  if (scope.cityId) ids.push(settingId(key, 'CITY', scope.cityId));
  if (scope.eventId) ids.push(settingId(key, 'EVENT', scope.eventId));
  const rows = await db.setting.findMany({ where: { id: { in: ids } } });
  const byId = new Map(rows.map((r) => [r.id, r.value]));
  for (const id of [...ids].reverse()) {
    if (!byId.has(id)) continue;
    const parsed = settingValueSchema(key).safeParse(byId.get(id));
    if (parsed.success) return parsed.data as SettingValue<K>;
  }
  return SETTINGS[key].default as SettingValue<K>;
}

export interface GlobalSettingRow {
  key: SettingKey;
  value: number | string;
  isDefault: boolean;
  updatedAt: Date | null;
}

/** Every GLOBAL setting with its effective value, in declaration order. */
export async function getGlobalSettings(db: Db): Promise<GlobalSettingRow[]> {
  const rows = await db.setting.findMany({ where: { scope: 'GLOBAL' } });
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return (Object.keys(SETTINGS) as SettingKey[]).map((key) => {
    const row = byKey.get(key);
    const parsed = row ? settingValueSchema(key).safeParse(row.value) : null;
    return parsed?.success
      ? { key, value: parsed.data, isDefault: false, updatedAt: row!.updatedAt }
      : { key, value: SETTINGS[key].default, isDefault: true, updatedAt: null };
  });
}
