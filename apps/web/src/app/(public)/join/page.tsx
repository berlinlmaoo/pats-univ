import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { isDemoOtp } from '@/lib/env';
import { getT } from '@/lib/i18n';
import { getSetting } from '@/lib/settings';
import { JoinFlow } from './join-flow';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: { absolute: t('join.metaTitle') }, description: t('join.metaDescription') };
}

/** Public registration (PRODUCT.md §4.1 steps 1–4). `?src=` comes from the venue / social QR. */
export default async function JoinPage({ searchParams }: { searchParams: Promise<{ src?: string | string[] }> }) {
  const { src } = await searchParams;
  const source = (Array.isArray(src) ? src[0] : src)?.trim().slice(0, 64) || undefined;
  const [cities, minAge] = await Promise.all([
    db.city.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, code: true, name: true } }),
    getSetting(db, 'minAge'),
  ]);
  // A source like "jkt" or "JKT-venue-1" preselects that city.
  const preset = source ? cities.find((c) => source.toUpperCase().startsWith(c.code)) : undefined;

  return (
    <JoinFlow
      cities={cities}
      minAge={minAge}
      source={source}
      defaultCityId={preset?.id ?? (cities.length === 1 ? cities[0]!.id : '')}
      demo={isDemoOtp()}
    />
  );
}
