import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('rounded-card border border-border bg-surface shadow-soft', className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 pt-5', className)}>
      <div className="min-w-0">
        {/* A short gold rule above the title: the KTM's header rule, in miniature. */}
        <span aria-hidden="true" className="mb-2 block h-[3px] w-6 rounded-full bg-gold" />
        <h2 className="text-title3 font-extrabold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-body-sm text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
