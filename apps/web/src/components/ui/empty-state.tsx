import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Why it's empty + what to do next + one action (DESIGN.md "Empty states"). */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center md:py-16', className)}>
      <div className="flex size-12 items-center justify-center rounded-control bg-band text-band-fg shadow-[inset_0_-3px_0_var(--pats-gold)]">
        <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-title3 font-extrabold text-fg">{title}</h3>
      <p className="mt-1 max-w-sm text-body-sm text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
