import type { Translator } from '@pats/shared';
import { Tabs } from '@/components/ui/tabs';
import { getT } from '@/lib/i18n';

export type CardsTab = 'queue' | 'batches' | 'open' | 'requests';

/** Section tabs of the Kartu page, as links so each one has its own URL. */
export async function CardTabs({ tab, counts }: { tab: CardsTab; counts: { queue: number; requests: number } }) {
  const t: Translator = await getT();
  const items: { value: CardsTab; label: string; count?: number }[] = [
    { value: 'queue', label: t('cards.tabQueue'), count: counts.queue },
    { value: 'batches', label: t('cards.tabBatches') },
    { value: 'open', label: t('cards.tabOpen') },
    { value: 'requests', label: t('cards.tabRequests'), count: counts.requests },
  ];
  return <Tabs label={t('cards.title')} active={tab} items={items.map((x) => ({ ...x, href: `/cards?tab=${x.value}` }))} />;
}
