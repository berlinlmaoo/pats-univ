import type { Metadata } from 'next';
import { OperationsPage } from '@/components/loyalty/operations';
import { getT } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('loyalty.recap') };
}

export default OperationsPage;
