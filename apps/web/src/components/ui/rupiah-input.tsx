'use client';

import { formatCount } from '@pats/shared';
import { useState, type ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { Input } from './field';

/**
 * Money field: shows "Rp 6.000.000" while typing (DESIGN.md §8), submits plain digits under
 * `name` and reports the number through `onValueChange` (null when empty).
 */
export function RupiahInput({
  name,
  defaultValue,
  onValueChange,
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'type' | 'value' | 'defaultValue' | 'onChange'> & {
  defaultValue?: number | null;
  onValueChange?: (value: number | null) => void;
}) {
  const [digits, setDigits] = useState(defaultValue ? String(defaultValue) : '');
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body font-semibold text-muted" aria-hidden="true">
        Rp
      </span>
      <Input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={digits ? formatCount(Number(digits)) : ''}
        className={cn('pl-11 tabular-nums', className)}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 12);
          setDigits(next);
          onValueChange?.(next ? Number(next) : null);
        }}
      />
      {name && <input type="hidden" name={name} value={digits} />}
    </div>
  );
}
