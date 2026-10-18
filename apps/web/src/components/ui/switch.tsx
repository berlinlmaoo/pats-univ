'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * On/off control for boolean rules (DESIGN.md §5 "Switch"). A real `role="switch"` button, with a
 * hidden input so it posts in plain forms: `name` submits `onValue` / `offValue` ("1" / "0" by
 * default, or "on" / nothing for checkbox-style reads with `checkboxStyle`).
 */
export function Switch({
  id,
  name,
  checked,
  defaultChecked,
  onChange,
  label,
  description,
  onValue = '1',
  offValue = '0',
  disabled,
  className,
}: {
  id: string;
  name?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  /** Visible label; omit when an external <label htmlFor> names it. */
  label?: string;
  description?: string;
  onValue?: string;
  /** `null` submits nothing when off (like a native checkbox). */
  offValue?: string | null;
  disabled?: boolean;
  className?: string;
}) {
  const [inner, setInner] = useState(Boolean(defaultChecked));
  const on = checked ?? inner;
  const toggle = () => {
    if (disabled) return;
    if (checked === undefined) setInner(!on);
    onChange?.(!on);
  };
  const control = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={toggle}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        on ? 'border-primary bg-primary' : 'border-border-strong bg-surface-muted',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-1/2 size-4.5 -translate-y-1/2 rounded-full shadow-soft transition-[left,background-color]',
          on ? 'left-[calc(100%-1.25rem)] bg-primary-fg' : 'left-0.5 bg-muted',
        )}
      />
    </button>
  );
  const hidden = name && (on || offValue !== null) ? <input type="hidden" name={name} value={on ? onValue : (offValue ?? '')} /> : null;
  if (!label) {
    return (
      <span className={cn('inline-flex items-center', className)}>
        {control}
        {hidden}
      </span>
    );
  }
  return (
    <div className={cn('flex min-h-11 items-center justify-between gap-4', className)}>
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-body-sm font-semibold text-fg">{label}</span>
        {description && <span className="mt-0.5 block text-caption text-muted">{description}</span>}
      </label>
      {control}
      {hidden}
    </div>
  );
}
