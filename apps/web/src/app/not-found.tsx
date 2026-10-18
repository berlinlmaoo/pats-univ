import { Compass } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { AuthFrame } from '@/components/ui/auth-frame';
import { EmptyState } from '@/components/ui/empty-state';
import { I18nProvider } from '@/components/i18n/provider';
import { getT } from '@/lib/i18n';

export default async function NotFound() {
  const t = await getT();
  return (
    <I18nProvider locale={t.locale}>
    <AuthFrame>
      <EmptyState
        icon={Compass}
        title={t('errors.pageNotFound')}
        body={t('errors.pageNotFoundBody')}
        action={
          <ButtonLink href="/" variant="secondary">
            {t('common.back')}
          </ButtonLink>
        }
      />
    </AuthFrame>
    </I18nProvider>
  );
}
