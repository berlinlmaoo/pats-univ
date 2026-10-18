'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';

export type TabItem = {
  /** Value for button tabs, or an href for link tabs. */
  value: string;
  label: string;
  /** Optional count shown after the label (e.g. pending items). */
  count?: number;
  href?: string;
};

/**
 * The one sub-navigation pattern (DESIGN.md §5 "Tabs"): heavy caps labels on a hairline, the
 * active tab carries the KTM gold rule. Scrolls sideways on narrow screens instead of wrapping.
 * Link tabs (`href`) for routes, button tabs (`onChange`) for in-page panels.
 */
export function Tabs({
  items,
  active,
  onChange,
  label,
  className,
}: {
  items: TabItem[];
  active: string;
  onChange?: (value: string) => void;
  /** Accessible name of the tab list. */
  label: string;
  className?: string;
}) {
  return (
    <div className={cn('-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]', className)}>
      <div role={onChange ? 'tablist' : undefined} aria-label={label} className="flex min-w-max gap-1 border-b border-border">
        {items.map((item) => {
          const selected = item.value === active;
          const cls = cn(
            'relative inline-flex h-11 items-center gap-2 whitespace-nowrap px-3 text-caption font-extrabold uppercase tracking-[0.06em] transition-colors',
            'after:absolute after:inset-x-2 after:-bottom-px after:h-[3px] after:rounded-t-sm after:transition-colors',
            selected ? 'text-fg after:bg-gold' : 'text-muted hover:text-fg after:bg-transparent hover:after:bg-border-strong/40',
          );
          const content = (
            <>
              <span>{item.label}</span>
              {item.count ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-secondary px-1 text-[11px] font-black tabular-nums text-secondary-fg">
                  {item.count}
                </span>
              ) : null}
            </>
          );
          if (item.href) {
            return (
              <Link key={item.value} href={item.href} aria-current={selected ? 'page' : undefined} className={cls}>
                {content}
              </Link>
            );
          }
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange?.(item.value)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                const i = items.findIndex((x) => x.value === item.value);
                const next = items[(i + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length]!;
                onChange?.(next.value);
                (e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]')[items.indexOf(next)])?.focus();
              }}
              className={cls}
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}
