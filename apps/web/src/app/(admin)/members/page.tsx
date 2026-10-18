import { formatCount, formatDate } from '@pats/shared';
import { ChevronLeft, ChevronRight, SearchX, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ActiveBadge, CardStatusBadge } from '@/components/dashboard/status';
import { Table, Td, Th, Tr } from '@/components/dashboard/table';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import type { Prisma } from '@/generated/prisma';
import { db } from '@/lib/db';
import { requireHq } from '@/lib/hq/guard';
import { getT } from '@/lib/i18n';
import { MemberFilters } from './filters';

const PAGE_SIZE = 25;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('members.title') };
}

type Search = { q?: string; city?: string; status?: string; page?: string };

export default async function MembersPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireHq();
  const t = await getT();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const cityId = sp.city ?? '';
  const status = sp.status === 'ACTIVE' || sp.status === 'INACTIVE' ? sp.status : '';
  const filtered = Boolean(q || cityId || status);

  const where: Prisma.MemberWhereInput = {
    ...(cityId && { cityId }),
    ...(status && { status }),
    ...(q && {
      OR: [
        { fullName: { contains: q, mode: 'insensitive' } },
        { nim: { contains: q.toUpperCase() } },
        { user: { email: { contains: q.toLowerCase() } } },
        { user: { phone: { contains: q.replace(/[^\d+]/g, '') || q } } },
      ],
    }),
  };

  const [cities, total] = await Promise.all([
    db.city.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.member.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const members = await db.member.findMany({
    where,
    orderBy: { joinedAt: 'desc' },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      user: { select: { email: true } },
      city: { select: { name: true, timezone: true } },
      cards: { select: { status: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (cityId) params.set('city', cityId);
    if (status) params.set('status', status);
    if (p > 1) params.set('page', String(p));
    const s = params.toString();
    return s ? `/members?${s}` : '/members';
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('members.title')} description={t('members.subtitle')} />

      <MemberFilters cities={cities} q={q} cityId={cityId} status={status} />

      <Card className="overflow-hidden">
        {members.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={SearchX}
              title={t('members.noResultsTitle')}
              body={t('members.noResultsBody')}
              action={
                <ButtonLink href="/members" variant="secondary">
                  {t('members.clearFilters')}
                </ButtonLink>
              }
            />
          ) : (
            <EmptyState icon={Users} title={t('members.emptyTitle')} body={t('members.emptyBody')} />
          )
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>{t('members.colName')}</Th>
                  <Th className="hidden sm:table-cell">{t('members.colNim')}</Th>
                  <Th className="hidden md:table-cell">{t('members.colCity')}</Th>
                  <Th className="hidden lg:table-cell">{t('members.colJoined')}</Th>
                  <Th>{t('members.colCard')}</Th>
                  <Th className="hidden md:table-cell">{t('members.colStatus')}</Th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <Tr key={m.id} className="relative">
                    <Td className="max-w-0 w-full sm:max-w-64 sm:w-auto">
                      <Link href={`/members/${m.id}`} className="block min-w-0 after:absolute after:inset-0 focus-visible:outline-none">
                        <span className="block truncate font-medium text-fg">{m.fullName}</span>
                        <span className="block truncate text-caption text-muted">
                          <span className="tabular-nums sm:hidden">{m.nim} · </span>
                          {m.user.email}
                        </span>
                      </Link>
                    </Td>
                    <Td className="hidden whitespace-nowrap tabular-nums text-fg sm:table-cell">{m.nim}</Td>
                    <Td className="hidden whitespace-nowrap text-muted md:table-cell">{m.city.name}</Td>
                    <Td className="hidden whitespace-nowrap text-muted lg:table-cell">
                      {formatDate(m.joinedAt, t.locale, { timeZone: m.city.timezone })}
                    </Td>
                    <Td>
                      <div className="flex flex-col items-start gap-1">
                        <CardStatusBadge status={m.cards[0]?.status ?? 'NOT_PRINTED'} t={t} />
                        {/* The status column hides below md; a deactivated member must still stand out. */}
                        {m.status !== 'ACTIVE' && (
                          <span className="md:hidden">
                            <ActiveBadge status={m.status} t={t} />
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td className="hidden md:table-cell">
                      <ActiveBadge status={m.status} t={t} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
              <p className="text-caption text-muted">{t('members.count', { count: formatCount(total) })}</p>
              {pages > 1 && (
                <div className="flex items-center gap-2">
                  <span className="hidden text-caption tabular-nums text-muted sm:inline">
                    {t('members.pageOf', { page, pages })}
                  </span>
                  <ButtonLink
                    href={pageHref(page - 1)}
                    variant="secondary"
                    size="sm"
                    aria-disabled={page <= 1}
                    tabIndex={page <= 1 ? -1 : undefined}
                    aria-label={t('members.previous')}
                    className="w-control-sm px-0"
                  >
                    <ChevronLeft aria-hidden="true" />
                  </ButtonLink>
                  <ButtonLink
                    href={pageHref(page + 1)}
                    variant="secondary"
                    size="sm"
                    aria-disabled={page >= pages}
                    tabIndex={page >= pages ? -1 : undefined}
                    aria-label={t('members.next')}
                    className="w-control-sm px-0"
                  >
                    <ChevronRight aria-hidden="true" />
                  </ButtonLink>
                </div>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
