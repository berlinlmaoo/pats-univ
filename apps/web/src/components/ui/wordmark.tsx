import { cn } from '@/lib/cn';

/** Text wordmark until the brand logo arrives (T13). */
export function Wordmark({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-2 whitespace-nowrap font-display font-bold tracking-tight text-fg', className)}>
      <span className="flex size-7 items-center justify-center rounded-sm bg-primary text-label font-extrabold leading-none tracking-normal text-primary-fg">
        PU
      </span>
      {!compact && <span className="text-body-lg">PATS University</span>}
    </span>
  );
}
