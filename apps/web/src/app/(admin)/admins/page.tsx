import { formatDate } from '@pats/shared';
import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { ActiveBadge } from '@/components/dashboard/status';
import { Table, Td, Th, Tr } from '@/components/dashboard/table';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { db } from '@/lib/db';
import { requireHq } from '@/lib/hq/guard';
import { getT } from '@/lib/i18n';
import { AddAdminButton, AdminRowActions } from './admin-actions';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('admins.title') };
}

export default async function AdminsPage() {
  await requireHq();
  const t = await getT();
  const [admins, cities] = await Promise.all([
    db.user.findMany({
      where: { role: 'REGIONAL_ADMIN' },
      orderBy: [{ city: { name: 'asc' } }, { name: 'asc' }],
      include: { city: { select: { name: true, timezone: true } } },
    }),
    db.city.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('admins.title')} description={t('admins.subtitle')} actions={<AddAdminButton cities={cities} />} />
      <Card className="overflow-hidden">
        {admins.length === 0 ? (
          <EmptyState icon={ShieldCheck} title={t('admins.emptyTitle')} body={t('admins.emptyBody')} action={<AddAdminButton cities={cities} />} />
        ) : (
          <>
          {/* Phones: one stacked row per admin, so the row action is never cut off (audit #19). */}
          <ul className="divide-y divide-border sm:hidden">
            {admins.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="break-words font-semibold text-fg">{a.name}</p>
                  <p className="break-all text-caption text-muted">{a.email}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <ActiveBadge status={a.status} t={t} />
                    <span className="text-caption text-muted">{a.city?.name ?? t('common.notSet')}</span>
                  </div>
                  <p className="mt-1 text-caption text-muted">
                    {t('admins.colLastLogin')}: {a.lastLoginAt ? formatDate(a.lastLoginAt, t.locale, { timeZone: a.city?.timezone }) : t('admins.never')}
                  </p>
                </div>
                <AdminRowActions admin={{ id: a.id, name: a.name, active: a.status === 'ACTIVE' }} />
              </li>
            ))}
          </ul>
          <Table className="hidden sm:table">
            <thead>
              <tr>
                <Th>{t('admins.colName')}</Th>
                <Th>{t('admins.colCity')}</Th>
                <Th className="hidden md:table-cell">{t('admins.colLastLogin')}</Th>
                <Th>{t('admins.colStatus')}</Th>
                <Th className="w-0">
                  <span className="sr-only">{t('common.status')}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <Tr key={a.id}>
                  <Td className="max-w-72">
                    <span className="block truncate font-medium text-fg">{a.name}</span>
                    <span className="block truncate text-caption text-muted">{a.email}</span>
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{a.city?.name ?? '—'}</Td>
                  <Td className="hidden whitespace-nowrap text-muted md:table-cell">
                    {a.lastLoginAt ? formatDate(a.lastLoginAt, t.locale, { timeZone: a.city?.timezone }) : t('admins.never')}
                  </Td>
                  <Td>
                    <ActiveBadge status={a.status} t={t} />
                  </Td>
                  <Td className="text-right">
                    <AdminRowActions admin={{ id: a.id, name: a.name, active: a.status === 'ACTIVE' }} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          </>
        )}
      </Card>
    </div>
  );
}
