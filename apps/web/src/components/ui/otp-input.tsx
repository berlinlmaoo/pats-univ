'use client';

import { OTP_LENGTH } from '@pats/shared';
import { useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Six boxes over one real input, so paste, SMS/email autofill (one-time-code) and screen
 * readers all work like a normal text field.
 */
export function OtpInput({
  id,
  value,
  onChange,
  onComplete,
  invalid,
  disabled,
  label,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  label: string;
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, OTP_LENGTH - 1);

  return (
    <div className="relative">
      <input
        id={id}
        aria-label={label}
        aria-invalid={invalid || undefined}
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d*"
        maxLength={OTP_LENGTH}
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH);
          onChange(next);
          if (next.length === OTP_LENGTH) onComplete?.(next);
        }}
      />
      <div className="grid grid-cols-6 gap-2" aria-hidden="true">
        {Array.from({ length: OTP_LENGTH }, (_, i) => {
          const char = value[i] ?? '';
          const isActive = focused && i === active;
          return (
            <div
              key={i}
              className={cn(
                'flex h-14 items-center justify-center rounded-control border bg-surface text-title2 font-semibold tabular-nums text-fg transition-[border-color,box-shadow]',
                invalid ? 'border-danger' : isActive ? 'border-accent ring-4 ring-accent/15' : 'border-border-strong',
                disabled && 'bg-surface-muted text-muted',
              )}
            >
              {char || (isActive ? <span className="h-6 w-px animate-pulse bg-fg" /> : null)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
