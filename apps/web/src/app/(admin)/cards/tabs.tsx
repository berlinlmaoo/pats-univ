import { formatCount, type Translator } from '@pats/shared';
import Link from 'next/link';
import { getT } from '@/lib/i18n';
import { cn } from '@/lib/cn';

export type CardsTab = 'queue' | 'batches' | 'open' | 'requests';

/** Section tabs of the Kartu page, as links so each one has its own URL. */
export async function CardTabs({ tab, counts }: { tab: CardsTab; counts: { queue: number; requests: number } }) {
  const t: Translator = await getT();
  const tabs: { value: CardsTab; label: string; count?: number }[] = [
    { value: 'queue', label: t('cards.tabQueue'), count: counts.queue },
    { value: 'batches', label: t('cards.tabBatches') },
    { value: 'open', label: t('cards.tabOpen') },
    { value: 'requests', label: t('cards.tabRequests'), count: counts.requests },
  ];
  return (
    <nav aria-label={t('cards.title')}>
      <div className="inline-flex max-w-full flex-wrap gap-y-1 rounded-control bg-surface-muted p-1">
        {tabs.map((x) => (
          <Link
            key={x.value}
            href={`/cards?tab=${x.value}`}
            aria-current={tab === x.value ? 'page' : undefined}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-sm px-3 text-body-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              tab === x.value ? 'bg-surface text-fg shadow-soft' : 'text-muted hover:text-fg',
            )}
          >
            {x.label}
            {x.count ? <span className="rounded-full bg-accent-subtle px-1.5 text-caption tabular-nums text-accent-subtle-fg">{formatCount(x.count)}</span> : null}
          </Link>
        ))}
      </div>
    </nav>
  );
}
