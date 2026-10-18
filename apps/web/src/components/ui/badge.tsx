import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const tones: Record<BadgeTone, { box: string; dot: string }> = {
  neutral: { box: 'bg-surface-muted text-muted', dot: 'bg-muted' },
  accent: { box: 'bg-accent-subtle text-accent-subtle-fg', dot: 'bg-accent' },
  success: { box: 'bg-success-subtle text-success-fg', dot: 'bg-success' },
  warning: { box: 'bg-warning-subtle text-warning-fg', dot: 'bg-warning' },
  danger: { box: 'bg-danger-subtle text-danger-fg', dot: 'bg-danger' },
};

export function Badge({ tone = 'neutral', dot, children, className }: { tone?: BadgeTone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        // Squared chips with the card's heavy caps, like a printed patch.
        'inline-flex h-6 max-w-full items-center gap-1.5 whitespace-nowrap rounded-sm px-2 text-[11px] font-extrabold uppercase tracking-[0.05em]',
        tones[tone].box,
        className,
      )}
    >
      {dot && <span className={cn('size-1.5 shrink-0 rounded-full', tones[tone].dot)} aria-hidden="true" />}
      <span className="truncate">{children}</span>
    </span>
  );
}
