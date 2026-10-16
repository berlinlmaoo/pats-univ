'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useT } from '@/components/i18n/provider';
import { Select } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/cn';

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
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div role="group" aria-label={t('events.colDate')} className="inline-flex rounded-control bg-surface-muted p-1">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              aria-pressed={when === tab.value}
              onClick={() => go({ when: tab.value })}
              className={cn(
                'h-8 whitespace-nowrap rounded-sm px-3 text-body-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                when === tab.value ? 'bg-surface text-fg shadow-soft' : 'text-muted hover:text-fg',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
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
