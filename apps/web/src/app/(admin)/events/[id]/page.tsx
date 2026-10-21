import { CHECK_IN_METHODS, cityCopy, eventPhase, fillCopy, formatCount, formatDate, formatTime, type CheckInMethod } from '@pats/shared';
import { ChevronLeft, ScanLine } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DetailList } from '@/components/dashboard/detail-list';
import { EventPhaseBadge, MethodBadge } from '@/components/dashboard/status';
import { Table, Td, Th, Tr } from '@/components/dashboard/table';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { can } from '@pats/shared';
import { cityScope } from '@/lib/loyalty/operations';
import { DrawPanel } from '@/components/phase5/draw';
import { db } from '@/lib/db';
import { eventFormOptions } from '@/lib/events/form-options';
import { eventInclude, toEventFormValues } from '@/lib/events/service';
import { requireDashboard } from '@/lib/hq/guard';
import { getT } from '@/lib/i18n';
import { EventDialogButton } from '../event-form';
import { EventActions } from './event-actions';
import { BroadcastButton } from './broadcast';
import { ContentPanel } from '@/components/events/content-panel';
import { eventContent } from '@/lib/events/content';
import { LiveRefresh } from './live-refresh';

type Params = { params: Promise<{ id: string }> };

async function load(id: string) {
  const admin = await requireDashboard();
  return db.event.findFirst({
    where: { id, cityId: cityScope(admin) },
    include: { ...eventInclude, createdBy: { select: { name: true } } },
  });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const event = await load((await params).id);
  return { title: event?.title ?? (await getT())('events.title') };
}

export default async function EventPage({ params }: Params) {
  const admin = await requireDashboard();
  const t = await getT();
  const event = await load((await params).id);
  if (!event) notFound();
  const now = new Date();
  const tz = event.city.timezone;
  const phase = eventPhase(event, now);

  const [checkIns, grouped, form, cityMembers, eventCity, content] = await Promise.all([
    db.checkIn.findMany({
      where: { eventId: event.id },
      orderBy: { checkedInAt: 'desc' },
      take: 500,
      include: { member: { select: { id: true, nim: true, fullName: true } }, admin: { select: { name: true } } },
    }),
    db.checkIn.groupBy({ by: ['method'], where: { eventId: event.id }, _count: { _all: true } }),
    eventFormOptions(cityScope(admin)),
    db.city.findMany({
      where: { active: true, id: cityScope(admin) },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, _count: { select: { members: { where: { status: 'ACTIVE', user: { status: 'ACTIVE' } } } } } },
    }),
    db.city.findUnique({ where: { id: event.cityId }, select: { notificationCopy: true } }),
    eventContent(admin, event.id),
  ]);
  const byMethod = Object.fromEntries(CHECK_IN_METHODS.map((m) => [m, 0])) as Record<CheckInMethod, number>;
  for (const g of grouped) byMethod[g.method] = g._count._all;
  const total = CHECK_IN_METHODS.reduce((n, m) => n + byMethod[m], 0);

  const dateTime = (d: Date) => `${formatDate(d, t.locale, { timeZone: tz })}, ${formatTime(d, { timeZone: tz })}`;
  const sameDay = formatDate(event.startsAt, t.locale, { timeZone: tz }) === formatDate(event.endsAt, t.locale, { timeZone: tz });
  /** "16 Okt, 07.30 WIB – 13.30 WIB", breaking only between the two ends, never inside one. */
  const range = (from: string, to: string) => (
    <>
      <span className="whitespace-nowrap">{from}</span> – <span className="whitespace-nowrap">{to}</span>
    </>
  );
  const pushValues = {
    event: event.title,
    venue: event.venue?.name ?? event.city.name,
    time: `${formatDate(event.startsAt, t.locale, { timeZone: tz })}, ${formatTime(event.startsAt, { timeZone: tz })}`,
    city: event.city.name,
    name: t('events.broadcastSampleName'),
  };
  const pushPreview = {
    title: fillCopy(t('push.eventBroadcast.title'), pushValues),
    body: fillCopy(cityCopy(eventCity?.notificationCopy, 'eventBroadcast', t.locale) ?? t('push.eventBroadcast.body'), pushValues),
  };
  const when = range(dateTime(event.startsAt), sameDay ? formatTime(event.endsAt, { timeZone: tz }) : dateTime(event.endsAt));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/events"
          className="-ml-1 inline-flex h-7 items-center gap-0.5 rounded-sm pr-1.5 text-body-sm font-medium text-muted transition-colors hover:text-fg"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {t('events.backToList')}
        </Link>
        <header className="mt-3 flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="break-words font-display text-title1 text-fg">{event.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-body-sm text-muted">
              <EventPhaseBadge phase={phase} t={t} />
              <span>{[event.venue?.name, event.city.name].filter(Boolean).join(' · ')}</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {can(admin.role, 'hq.manage') && <BroadcastButton
              eventId={event.id}
              eventCityId={event.cityId}
              cities={cityMembers.map((c) => ({ id: c.id, name: c.name, members: c._count.members }))}
              preview={pushPreview}
              disabled={event.status === 'DRAFT'}
            />}
            <EventDialogButton
              cities={form.cities}
              defaults={form.defaults}
              event={{ id: event.id, values: toEventFormValues(event), cityLocked: total > 0 }}
            />
            <EventActions
              eventId={event.id}
              phase={phase}
              cityName={event.city.name}
              opensAtLabel={formatTime(event.checkInOpensAt, { timeZone: tz })}
              closesAtLabel={dateTime(event.checkInClosesAt)}
              opensEarly={now < event.checkInOpensAt}
            />
          </div>
        </header>
      </div>

      <DrawPanel eventId={event.id} ended={event.endsAt <= now} />
      <div className="grid items-start gap-6 lg:grid-cols-5">
        <Card className="min-w-0 overflow-hidden lg:col-span-3">
          <CardHeader
            title={t('events.attendance')}
            description={phase === 'open' ? <LiveRefresh eventId={event.id} /> : undefined}
            action={<span className="font-display text-title2 tabular-nums text-fg">{formatCount(total)}</span>}
            className="pb-4"
          />
          {checkIns.length === 0 ? (
            <div className="border-t border-border">
              <EmptyState icon={ScanLine} title={t('events.attendanceEmptyTitle')} body={t('events.attendanceEmptyBody')} />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t('events.colMember')}</Th>
                  <Th>{t('events.colTime')}</Th>
                  <Th className="hidden sm:table-cell">{t('events.colMethod')}</Th>
                  <Th className="hidden md:table-cell">{t('events.colBy')}</Th>
                </tr>
              </thead>
              <tbody>
                {checkIns.map((c) => (
                  <Tr key={c.id} className="relative">
                    <Td className="w-full max-w-0 sm:max-w-64 sm:w-auto">
                      <Link href={`/members/${c.member.id}`} className="block min-w-0 after:absolute after:inset-0 focus-visible:outline-none">
                        <span className="block truncate font-medium text-fg">{c.member.fullName}</span>
                        <span className="block truncate text-caption tabular-nums text-muted">
                          {c.member.nim}
                          <span className="sm:hidden"> · {t(`checkInMethod.${c.method}`)}</span>
                        </span>
                        {c.manualReason && (
                          <span className="block truncate text-caption text-warning-fg">{t('events.reason', { reason: c.manualReason })}</span>
                        )}
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap tabular-nums text-fg">{formatTime(c.checkedInAt, { timeZone: tz, withZone: false })}</Td>
                    <Td className="hidden sm:table-cell">
                      <MethodBadge method={c.method} t={t} />
                    </Td>
                    <Td className="hidden max-w-40 truncate text-muted md:table-cell">{c.admin.name}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader title={t('events.details')} className="pb-3" />
            <div className="border-t border-border">
              <DetailList
                items={[
                  { label: t('events.when'), value: when },
                  {
                    label: t('events.window'),
                    value: range(dateTime(event.checkInOpensAt), formatTime(event.checkInClosesAt, { timeZone: tz })),
                  },
                  { label: t('events.venue'), value: event.venue ? event.venue.name : <span className="text-muted">{t('events.venueNone')}</span> },
                  {
                    label: t('events.capacity'),
                    value: event.capacity
                      ? t('events.capacityValue', { count: formatCount(total), capacity: formatCount(event.capacity) })
                      : <span className="text-muted">{t('events.noCapacity')}</span>,
                  },
                  ...(event.createdBy ? [{ label: t('events.createdBy'), value: event.createdBy.name }] : []),
                ]}
              />
            </div>
            {event.description && (
              <p className="whitespace-pre-line border-t border-border px-5 py-4 text-body-sm text-muted">{event.description}</p>
            )}
          </Card>

          <ContentPanel
            eventId={event.id}
            eventTitle={event.title}
            live={content.live}
            mode={content.mode}
            pending={content.pending}
            canDecide={can(admin.role, 'hq.manage')}
          />

          <Card>
            <CardHeader title={t('events.checkIns')} className="pb-3" />
            <ul className="divide-y divide-border border-t border-border">
              {CHECK_IN_METHODS.map((m) => {
                const percent = total ? Math.round((byMethod[m] / total) * 100) : 0;
                return (
                  <li key={m} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3 text-body-sm">
                      <MethodBadge method={m} t={t} />
                      <span className="tabular-nums text-fg">
                        {formatCount(byMethod[m])}
                        <span className="ml-2 inline-block w-10 text-right text-muted">{t('events.share', { percent })}</span>
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
