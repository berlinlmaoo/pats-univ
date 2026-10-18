import type { ReactNode } from 'react';

/** Label/value rows inside a card. */
export function DetailList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-border">
      {items.map(({ label, value }) => (
        <div key={label} className="grid grid-cols-1 gap-0.5 px-5 py-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:gap-4">
          <dt className="ktm-label pt-0.5 text-muted">{label}</dt>
          <dd className="min-w-0 break-words text-body-sm text-fg">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
