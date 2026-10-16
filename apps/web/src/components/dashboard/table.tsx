import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Table that scrolls inside its card on narrow screens instead of the page. */
export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full border-collapse text-left text-body-sm', className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      scope="col"
      className={cn('h-10 whitespace-nowrap border-b border-border bg-surface-muted px-4 text-caption font-medium text-muted first:pl-5 last:pr-5', className)}
      {...props}
    />
  );
}

export function Td({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('h-14 border-b border-border px-4 align-middle first:pl-5 last:pr-5', className)} {...props} />;
}

export function Tr({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('transition-colors last:[&>td]:border-b-0 hover:bg-surface-hover', className)} {...props} />;
}
