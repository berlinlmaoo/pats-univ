'use client';

import { CalendarDays } from 'lucide-react';
import { useId, useRef, useState, type ComponentProps } from 'react';
import { useT } from '@/components/i18n/provider';
import { cn } from '@/lib/cn';
import { Input } from './field';

/*
 * Date and time inputs that read the same in every browser: dd/mm/yyyy and a 24-hour clock
 * (DESIGN.md §8). Native date/time pickers follow the browser's own locale, which showed
 * mm/dd/yyyy and AM/PM to Indonesian crews. The visible field is a masked text input; a hidden
 * input carries the ISO value (`yyyy-mm-dd`, `HH:MM`, `yyyy-mm-ddTHH:MM`) under `name`, so
 * existing form handlers keep working unchanged.
 */

type Shared = Omit<ComponentProps<'input'>, 'type' | 'value' | 'defaultValue' | 'onChange'> & {
  name?: string;
  defaultValue?: string;
  onValueChange?: (iso: string) => void;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-10-18" -> "18/10/2026". */
export function isoToDisplayDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** "18/10/2026" (or "18-10-2026", "18.10.2026") -> "2026-10-18"; '' when incomplete or impossible. */
export function displayToIsoDate(text: string): string {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text.trim());
  if (!m) return '';
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return '';
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** "2030" / "20.30" / "20:30" / "9.5" -> "20:30" / "09:05"; '' when not a valid 24-hour time. */
export function displayToIsoTime(text: string): string {
  const raw = text.trim();
  const m = /^(\d{1,2})[.:](\d{1,2})$/.exec(raw) ?? /^(\d{2})(\d{2})$/.exec(raw);
  if (!m) return '';
  const [h, min] = [Number(m[1]), Number(m[2])];
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : '';
}

function maskDate(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/');
}

function maskTime(text: string, sep: string): string {
  if (/[.:]/.test(text)) return text.replace(/[^\d.:]/g, '').replace(/[.:]/, sep).slice(0, 5);
  const digits = text.replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}${sep}${digits.slice(2)}` : digits;
}

/** dd/mm/yyyy text field with a calendar button (the native picker, value only). */
export function DateInput({ name, defaultValue = '', onValueChange, className, id, required, disabled, ...props }: Shared) {
  const t = useT();
  const auto = useId();
  const [text, setText] = useState(isoToDisplayDate(defaultValue));
  const picker = useRef<HTMLInputElement>(null);
  const iso = displayToIsoDate(text);
  const set = (next: string) => {
    setText(next);
    onValueChange?.(displayToIsoDate(next));
  };
  return (
    <div className="relative">
      <Input
        {...props}
        id={id ?? auto}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={t('ops.datePlaceholder')}
        value={text}
        required={required}
        disabled={disabled}
        maxLength={10}
        pattern="\d{2}/\d{2}/\d{4}"
        className={cn('pr-11 tabular-nums', className)}
        onChange={(e) => set(maskDate(e.target.value))}
      />
      {name && <input type="hidden" name={name} value={iso} />}
      <button
        type="button"
        disabled={disabled}
        aria-label={t('ops.pickDate')}
        className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-sm text-muted transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50"
        onClick={() => {
          const el = picker.current;
          if (!el) return;
          el.value = iso;
          try {
            el.showPicker();
          } catch {
            el.focus();
          }
        }}
      >
        <CalendarDays className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </button>
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-0 size-px opacity-0"
        onChange={(e) => e.target.value && set(isoToDisplayDate(e.target.value))}
      />
    </div>
  );
}

/** 24-hour time, shown "20.30" in Indonesian and "20:30" in English; submits "HH:MM". */
export function TimeInput({ name, defaultValue = '', onValueChange, className, id, ...props }: Shared) {
  const t = useT();
  const auto = useId();
  const sep = t.locale === 'id' ? '.' : ':';
  const [text, setText] = useState(defaultValue ? defaultValue.replace(':', sep) : '');
  const iso = displayToIsoTime(text);
  return (
    <>
      <Input
        {...props}
        id={id ?? auto}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={t('ops.timePlaceholder')}
        value={text}
        maxLength={5}
        className={cn('tabular-nums', className)}
        onChange={(e) => {
          const next = maskTime(e.target.value, sep);
          setText(next);
          onValueChange?.(displayToIsoTime(next));
        }}
        onBlur={() => iso && setText(iso.replace(':', sep))}
      />
      {name && <input type="hidden" name={name} value={iso} />}
    </>
  );
}

/** Date + 24-hour time side by side; submits `yyyy-mm-ddTHH:MM` (the datetime-local format). */
export function DateTimeInput({
  name,
  id,
  defaultValue = '',
  required,
  disabled,
  onValueChange,
  'aria-invalid': invalid,
}: Shared) {
  const t = useT();
  const auto = useId();
  const [d0, t0] = defaultValue.split('T');
  const [date, setDate] = useState(d0 ?? '');
  const [time, setTime] = useState((t0 ?? '').slice(0, 5));
  const value = date && time ? `${date}T${time}` : '';
  const base = id ?? auto;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
      <DateInput
        id={base}
        defaultValue={d0 ?? ''}
        required={required}
        disabled={disabled}
        aria-invalid={invalid}
        onValueChange={(v) => {
          setDate(v);
          onValueChange?.(v && time ? `${v}T${time}` : '');
        }}
      />
      <TimeInput
        id={`${base}-time`}
        aria-label={t('ops.time24')}
        defaultValue={(t0 ?? '').slice(0, 5)}
        required={required}
        disabled={disabled}
        aria-invalid={invalid}
        onValueChange={(v) => {
          setTime(v);
          onValueChange?.(date && v ? `${date}T${v}` : '');
        }}
      />
      {name && <input type="hidden" name={name} value={value} />}
    </div>
  );
}
