'use client';

import { Search } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { useT } from '@/components/i18n/provider';
import { Input, Select } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/cn';

/** Search + filters kept in the URL, so a filtered list can be shared or reloaded. */
export function MemberFilters({
  cities,
  q,
  cityId,
  status,
}: {
  cities: { id: string; name: string }[];
  q: string;
  cityId: string;
  status: string;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState(q);

  const apply = (next: { q?: string; city?: string; status?: string }) => {
    const params = new URLSearchParams();
    const merged = { q: query, city: cityId, status, ...next };
    if (merged.q.trim()) params.set('q', merged.q.trim());
    if (merged.city) params.set('city', merged.city);
    if (merged.status) params.set('status', merged.status);
    const s = params.toString();
    start(() => router.replace(s ? `${pathname}?${s}` : pathname));
  };

  // Debounced search-as-you-type.
  useEffect(() => {
    if (query === q) return;
    const id = window.setTimeout(() => apply({ q: query }), 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
          {pending ? <Spinner /> : <Search className="size-4" aria-hidden="true" />}
        </span>
        <Input
          type="search"
          aria-label={t('common.search')}
          placeholder={t('members.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-control-md pl-10 text-body-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <Select
          aria-label={t('members.colCity')}
          value={cityId}
          onChange={(e) => apply({ city: e.target.value })}
          className={cn('h-control-md text-body-sm sm:w-44')}
        >
          <option value="">{t('members.allCities')}</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label={t('members.colStatus')}
          value={status}
          onChange={(e) => apply({ status: e.target.value })}
          className="h-control-md text-body-sm sm:w-40"
        >
          <option value="">{t('members.allStatuses')}</option>
          <option value="ACTIVE">{t('common.active')}</option>
          <option value="INACTIVE">{t('common.inactive')}</option>
        </Select>
      </div>
    </div>
  );
}
