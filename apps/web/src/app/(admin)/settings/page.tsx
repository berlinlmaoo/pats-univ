import { SETTING_GROUPS, SETTINGS, type SettingGroup } from '@pats/shared';
import type { Metadata } from 'next';
import { Card, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { db } from '@/lib/db';
import { requireHq } from '@/lib/hq/guard';
import { getT } from '@/lib/i18n';
import { getGlobalSettings } from '@/lib/settings';
import { SettingRow } from './setting-row';

const GROUP_LABEL = {
  membership: 'settings.groupMembership',
  checkIn: 'settings.groupCheckIn',
  xp: 'settings.groupXp',
  leaderboard: 'settings.groupLeaderboard',
  promoter: 'settings.groupPromoter',
  roaming: 'settings.groupRoaming',
  notifications: 'settings.groupNotifications',
  app: 'settings.groupApp',
  hub: 'settings.groupHub',
} as const satisfies Record<SettingGroup, string>;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('settings.title') };
}

export default async function SettingsPage() {
  await requireHq();
  const t = await getT();
  const rows = await getGlobalSettings(db);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('settings.title')} description={t('settings.subtitle')} />
      {SETTING_GROUPS.map((group) => {
        const items = rows.filter((r) => SETTINGS[r.key].group === group);
        if (items.length === 0) return null;
        return (
          <Card key={group}>
            <CardHeader title={t(GROUP_LABEL[group])} className="pb-3" />
            <ul className="divide-y divide-border border-t border-border">
              {items.map((row) => (
                <li key={row.key}>
                  <SettingRow
                    settingKey={row.key}
                    value={String(row.value)}
                    defaultValue={String(SETTINGS[row.key].default)}
                  />
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
