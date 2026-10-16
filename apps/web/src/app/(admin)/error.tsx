'use client';

import { TriangleAlert } from 'lucide-react';
import { useT } from '@/components/i18n/provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  const t = useT();
  return (
    <Card>
      <EmptyState
        icon={TriangleAlert}
        title={t('errors.generic')}
        body={t('errors.network')}
        action={
          <Button variant="secondary" onClick={reset}>
            {t('common.retry')}
          </Button>
        }
      />
    </Card>
  );
}
