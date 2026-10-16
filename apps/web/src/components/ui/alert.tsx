import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const tones = {
  info: { box: 'bg-accent-subtle text-accent-subtle-fg', Icon: Info },
  success: { box: 'bg-success-subtle text-success-fg', Icon: CircleCheck },
  danger: { box: 'bg-danger-subtle text-danger-fg', Icon: CircleAlert },
} as const;

export function Alert({ tone = 'info', children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) {
  const { box, Icon } = tones[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-2.5 rounded-control px-3.5 py-3 text-body-sm', box, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
