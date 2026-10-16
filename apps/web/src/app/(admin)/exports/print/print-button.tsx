'use client';
import { Button } from '@/components/ui/button';
import { useT } from '@/components/i18n/provider';
export function PrintButton() {
  const t = useT();
  return <Button onClick={() => window.print()}>{t('loyalty.print')}</Button>;
}
