import { formatCount } from '@pats/shared';
import { Building2 } from 'lucide-react';
import type { Metadata } from 'next';
import { Table, Td, Th, Tr } from '@/components/dashboard/table';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { db } from '@/lib/db';
import { requireHq } from '@/lib/hq/guard';
import { getT } from '@/lib/i18n';
import { CityCopyButton } from './copy-dialog';
import { CityDialogButton } from './city-dialog';
import { notificationCopySchema, type NotificationCopy } from '@pats/shared';

const parseCopy = (raw: unknown): NotificationCopy => notificationCopySchema.safeParse(raw ?? {}).data ?? {};

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('cities.title') };
}

export default async function CitiesPage() {
  await requireHq();
  const t = await getT();
  const cities = await db.city.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { members: true, venues: true, admins: { where: { role: 'REGIONAL_ADMIN' } } } },
      venues: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('cities.title')} description={t('cities.subtitle')} actions={<CityDialogButton />} />
      <Card className="overflow-hidden">
        {cities.length === 0 ? (
          <EmptyState icon={Building2} title={t('cities.emptyTitle')} body={t('cities.emptyBody')} action={<CityDialogButton />} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('cities.colCity')}</Th>
                <Th className="hidden sm:table-cell">{t('cities.colTimezone')}</Th>
                <Th className="hidden text-right sm:table-cell">{t('cities.colMembers')}</Th>
                <Th className="hidden text-right md:table-cell">{t('cities.colAdmins')}</Th>
                <Th className="hidden lg:table-cell">{t('cities.venues')}</Th>
                <Th>{t('cities.colWa')}</Th>
                <Th className="w-0">
                  <span className="sr-only">{t('common.edit')}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {cities.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <span className="font-medium text-fg">{c.name}</span>
                    <span className="ml-2 rounded-sm bg-surface-muted px-1.5 py-0.5 text-caption font-medium text-muted">{c.code}</span>
                  </Td>
                  <Td className="hidden whitespace-nowrap text-muted sm:table-cell">{c.timezone}</Td>
                  <Td className="hidden text-right tabular-nums sm:table-cell">{formatCount(c._count.members)}</Td>
                  <Td className="hidden text-right tabular-nums md:table-cell">{formatCount(c._count.admins)}</Td>
                  <Td className="hidden max-w-56 truncate text-muted lg:table-cell">
                    {c.venues.length ? c.venues.map((v) => v.name).join(', ') : '—'}
                  </Td>
                  <Td>
                    {c.waGroupUrl ? (
                      <Badge tone="success" dot>
                        {t('cities.waSet')}
                      </Badge>
                    ) : (
                      <Badge tone="warning" dot>
                        {t('cities.waMissing')}
                      </Badge>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    <CityCopyButton city={{ id: c.id, name: c.name }} copy={parseCopy(c.notificationCopy)} />
                    <CityDialogButton
                      city={{ id: c.id, code: c.code, name: c.name, timezone: c.timezone, waGroupUrl: c.waGroupUrl ?? '', locked: c._count.members > 0 }}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
