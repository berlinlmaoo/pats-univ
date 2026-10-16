import { Compass } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { getT } from '@/lib/i18n';

export default async function NotFound() {
  const t = await getT();
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <EmptyState
        icon={Compass}
        title={t('errors.notFound')}
        body={t('errors.notFoundBody')}
        action={
          <ButtonLink href="/" variant="secondary">
            {t('common.back')}
          </ButtonLink>
        }
      />
    </main>
  );
}
