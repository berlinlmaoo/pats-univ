'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useT } from '@/components/i18n/provider';
import { Select } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Tabs } from '@/components/ui/tabs';

export type When = 'upcoming' | 'past' | 'all';

/** Time range tabs + city filter, kept in the URL. */
export function EventFilters({ cities, when, cityId }: { cities: { id: string; name: string }[]; when: When; cityId: string }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();

  const go = (next: { when?: When; city?: string }) => {
    const merged = { when, city: cityId, ...next };
    const params = new URLSearchParams();
    if (merged.when !== 'upcoming') params.set('when', merged.when);
    if (merged.city) params.set('city', merged.city);
    const s = params.toString();
    start(() => router.replace(s ? `${pathname}?${s}` : pathname));
  };

  const tabs: { value: When; label: string }[] = [
    { value: 'upcoming', label: t('events.filterUpcoming') },
    { value: 'past', label: t('events.filterPast') },
    { value: 'all', label: t('events.filterAll') },
  ];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <Tabs label={t('events.colDate')} active={when} onChange={(v) => go({ when: v as When })} items={tabs} />
        {pending && <Spinner />}
      </div>
      <Select aria-label={t('events.colCity')} value={cityId} onChange={(e) => go({ city: e.target.value })} className="h-control-md text-body-sm sm:w-44">
        <option value="">{t('events.allCities')}</option>
        {cities.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
