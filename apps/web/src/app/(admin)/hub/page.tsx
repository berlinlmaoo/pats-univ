import type { Metadata } from 'next';
import HubPage from '@/components/social/hub';
import { getT } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('social.title') };
}

export default HubPage;
