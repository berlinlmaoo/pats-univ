import type { Metadata } from 'next';
import { ExportsPage } from '@/components/loyalty/exports';
import { requireHq } from '@/lib/hq/guard';
import { getT } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('loyalty.export') };
}

export default async function Page() {
  await requireHq();
  return <ExportsPage />;
}
