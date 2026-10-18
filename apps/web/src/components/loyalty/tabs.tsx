'use client';

import { useT } from '@/components/i18n/provider';
import { Tabs } from '@/components/ui/tabs';

/** Rewards ↔ leaderboard, the two loyalty pages. The leaderboard is HQ-only (same guard as the nav). */
export function LoyaltyTabs({ active, hq }: { active: '/rewards' | '/leaderboard'; hq: boolean }) {
  const t = useT();
  if (!hq) return null;
  return (
    <Tabs
      label={t('loyalty.title')}
      active={active}
      items={[
        { value: '/rewards', href: '/rewards', label: t('loyalty.catalogue') },
        { value: '/leaderboard', href: '/leaderboard', label: t('loyalty.leaderboard') },
      ]}
    />
  );
}
