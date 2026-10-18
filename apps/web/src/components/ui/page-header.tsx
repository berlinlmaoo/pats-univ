import type { ReactNode } from 'react';

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    // The page title carries the card's varsity slab and sits on the KTM gold rule.
    <header className="flex flex-col gap-4 border-b-[3px] border-gold pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="varsity break-words text-fg">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-body-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">{actions}</div>}
    </header>
  );
}
