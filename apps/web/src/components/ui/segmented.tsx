'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';

export type SegmentedItem = { value: string; label: string; count?: number; href?: string };

/**
 * Second-level switch inside a tab or a filter row (DESIGN.md §6): smaller than Tabs, a muted
 * track with the active segment raised. Link segments (`href`) for URL filters, buttons otherwise.
 * Wraps on narrow screens instead of clipping.
 */
export function Segmented({
  items,
  active,
  onChange,
  label,
  className,
}: {
  items: SegmentedItem[];
  active: string;
  onChange?: (value: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex max-w-full flex-wrap gap-0.5 rounded-control bg-surface-muted p-0.5', className)}>
      {items.map((item) => {
        const selected = item.value === active;
        const cls = cn(
          'inline-flex h-control-sm items-center gap-1.5 whitespace-nowrap rounded-[calc(var(--pats-radius-control)-2px)] px-3 text-body-sm transition-colors',
          selected ? 'bg-surface font-bold text-fg shadow-soft' : 'font-medium text-muted hover:text-fg',
        );
        const content = (
          <>
            {item.label}
            {item.count ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-secondary px-1 text-caption font-black tabular-nums text-secondary-fg">
                {item.count}
              </span>
            ) : null}
          </>
        );
        return item.href ? (
          <Link key={item.value} href={item.href} aria-current={selected ? 'page' : undefined} className={cls}>
            {content}
          </Link>
        ) : (
          <button key={item.value} type="button" aria-pressed={selected} onClick={() => onChange?.(item.value)} className={cls}>
            {content}
          </button>
        );
      })}
    </div>
  );
}
