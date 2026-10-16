import { I18nProvider } from '@/components/i18n/provider';
import { getLocale } from '@/lib/i18n';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  return <I18nProvider locale={await getLocale()}>{children}</I18nProvider>;
}
