import { eventPhase, formatCount, formatDate, formatTime } from '@pats/shared';
import { CalendarDays, CalendarX2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EventPhaseBadge } from '@/components/dashboard/status';
import { Table, Td, Th, Tr } from '@/components/dashboard/table';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import type { Prisma } from '@/generated/prisma';
import { db } from '@/lib/db';
import { requireHq } from '@/lib/hq/guard';
import { getT } from '@/lib/i18n';
import { eventFormOptions } from '@/lib/events/form-options';
import { EventDialogButton } from './event-form';
import { EventFilters, type When } from './filters';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('events.title') };
}

type Search = { when?: string; city?: string };

export default async function EventsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireHq();
  const t = await getT();
  const sp = await searchParams;
  const when: When = sp.when === 'past' || sp.when === 'all' ? sp.when : 'upcoming';
  const cityId = sp.city ?? '';
  const now = new Date();

  const where: Prisma.EventWhereInput = {
    ...(cityId && { cityId }),
    ...(when === 'upcoming' && { endsAt: { gte: now } }),
    ...(when === 'past' && { endsAt: { lt: now } }),
  };
  const [events, form, anyEvent] = await Promise.all([
    db.event.findMany({
      where,
      orderBy: { startsAt: when === 'upcoming' ? 'asc' : 'desc' },
      take: 100,
      include: {
        city: { select: { name: true, timezone: true } },
        venue: { select: { name: true } },
        _count: { select: { checkIns: true } },
      },
    }),
    eventFormOptions(),
    db.event.count().then((n) => n > 0),
  ]);

  const newButton = <EventDialogButton cities={form.cities} defaults={form.defaults} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('events.title')} description={t('events.subtitle')} actions={newButton} />
      {anyEvent && <EventFilters cities={form.cities} when={when} cityId={cityId} />}

      <Card className="overflow-hidden">
        {events.length === 0 ? (
          anyEvent ? (
            <EmptyState
              icon={CalendarX2}
              title={t('events.noResultsTitle')}
              body={t('events.noResultsBody')}
              action={
                <ButtonLink href="/events?when=all" variant="secondary">
                  {t('events.showAll')}
                </ButtonLink>
              }
            />
          ) : (
            <EmptyState icon={CalendarDays} title={t('events.emptyTitle')} body={t('events.emptyBody')} action={newButton} />
          )
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('events.colEvent')}</Th>
                <Th className="hidden md:table-cell">{t('events.colCity')}</Th>
                <Th className="hidden sm:table-cell">{t('events.colDate')}</Th>
                <Th>{t('events.colStatus')}</Th>
                <Th className="hidden text-right sm:table-cell">{t('events.colCheckIns')}</Th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const tz = e.city.timezone;
                const date = formatDate(e.startsAt, t.locale, { timeZone: tz });
                const time = formatTime(e.startsAt, { timeZone: tz });
                return (
                  <Tr key={e.id} className="relative">
                    <Td className="w-full max-w-0 sm:max-w-80 sm:w-auto">
                      <Link href={`/events/${e.id}`} className="block min-w-0 after:absolute after:inset-0 focus-visible:outline-none">
                        <span className="block break-words font-medium text-fg sm:truncate">{e.title}</span>
                        <span className="block break-words text-caption text-muted sm:truncate">
                          <span className="sm:hidden">
                            {date}, {time} ·{' '}
                          </span>
                          {[e.venue?.name, e.city.name].filter(Boolean).join(' · ')}
                        </span>
                      </Link>
                    </Td>
                    <Td className="hidden whitespace-nowrap text-muted md:table-cell">{e.city.name}</Td>
                    <Td className="hidden whitespace-nowrap sm:table-cell">
                      <span className="text-fg">{date}</span>
                      <span className="ml-1.5 tabular-nums text-muted">{time}</span>
                    </Td>
                    <Td>
                      <EventPhaseBadge phase={eventPhase(e, now)} t={t} />
                    </Td>
                    <Td className="hidden text-right tabular-nums text-fg sm:table-cell">{formatCount(e._count.checkIns)}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
