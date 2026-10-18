'use client';

import { formatCount, formatRupiah, SETTINGS, type SettingDefinition, type SettingKey } from '@pats/shared';
import { Check } from 'lucide-react';
import { useActionState, useState } from 'react';
import { useT } from '@/components/i18n/provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { TimeInput } from '@/components/ui/date-time';
import { RupiahInput } from '@/components/ui/rupiah-input';
import { Switch } from '@/components/ui/switch';
import type { ActionResult } from '@/lib/hq/action-result';
import { saveSettingAction } from '@/lib/hq/settings';
import { cn } from '@/lib/cn';

const UNIT_LABEL = {
  months: 'settings.unitMonths',
  rupiah: 'settings.unitRupiah',
  slots: 'settings.unitSlots',
  requests: 'settings.unitRequests',
  days: 'settings.unitDays',
  mb: 'settings.unitMb',
  years: 'settings.unitYears',
  xp: 'settings.unitXp',
  minutes: 'settings.unitMinutes',
  seconds: 'settings.unitSeconds',
  hours: 'settings.unitHours',
  percent: 'settings.unitPercent',
  ranks: 'settings.unitRanks',
  admins: 'settings.unitAdmins',
  toggle: 'settings.unitXp',
} as const;

/** Every control on the right column has the same width, so the save buttons line up. */
const CONTROL_W = 'w-full sm:w-56';

/** One editable rule: label + hint on the left, control + save on the right. */
export function SettingRow({ settingKey, value, defaultValue }: { settingKey: SettingKey; value: string; defaultValue: string }) {
  const t = useT();
  const def: SettingDefinition = SETTINGS[settingKey];
  const [draft, setDraft] = useState(value);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveSettingAction.bind(null, settingKey), null);
  const dirty = draft.trim() !== value;
  // Shown after a successful save until the value is edited again.
  const justSaved = Boolean(state?.ok) && !dirty;
  const errorKey = state && !state.ok ? state.fields?.value : undefined;
  const error =
    errorKey && def.kind === 'int' ? t.loose(errorKey, { min: def.min, max: def.max }) : errorKey ? t.loose(errorKey) : undefined;
  const id = `setting-${settingKey}`;
  const label = t.loose(`settings.keys.${settingKey}.label`);

  return (
    <form action={action} noValidate className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-8">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={id} className="text-body-sm font-medium text-fg">
            {label}
          </label>
          {'tbd' in def && def.tbd && <Badge tone="warning">{t('settings.tbd')}</Badge>}
        </div>
        <p className="mt-0.5 text-caption text-muted">
          {t.loose(`settings.keys.${settingKey}.hint`)}
          {'tbd' in def && def.tbd && <span className="text-warning-fg"> {t('settings.tbdHint')}</span>}
          {defaultValue !== '' && (
            <span className="whitespace-nowrap">
              {' '}
              · {t('settings.defaultValue')}: {displayValue(def, defaultValue, t)}
            </span>
          )}
        </p>
      </div>

      <div className="flex flex-col gap-1.5 md:items-end">
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Control def={def} id={id} value={draft} onChange={setDraft} invalid={Boolean(error)} />
          <Button type="submit" variant={dirty ? 'primary' : 'secondary'} size="md" disabled={!dirty} loading={pending} className="w-24 shrink-0">
            {justSaved && !dirty ? <Check aria-hidden="true" /> : null}
            {justSaved && !dirty ? t('common.saved') : t('common.save')}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-caption text-danger-fg">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}

/** A value as people read it: option labels, "10.00" times, units. */
function displayValue(def: SettingDefinition, value: string, t: ReturnType<typeof useT>): string {
  switch (def.kind) {
    case 'enum':
      return t.loose(def.options.find((o) => o.value === value)?.labelKey ?? value);
    case 'time':
      return value.replace(':', '.');
    case 'int':
      if (def.unit === 'toggle') return value === '1' ? t('settings.on') : t('settings.off');
      if (def.unit === 'rupiah') return formatRupiah(Number(value));
      return `${formatCount(Number(value))} ${t(UNIT_LABEL[def.unit])}`;
    default:
      return value;
  }
}

function Control({
  def,
  id,
  value,
  onChange,
  invalid,
}: {
  def: SettingDefinition;
  id: string;
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
}) {
  const t = useT();
  const common = { id, name: 'value', value, 'aria-invalid': invalid || undefined };
  switch (def.kind) {
    case 'int':
      if (def.unit === 'toggle') {
        return (
          <div className={cn('flex h-control-md items-center justify-between gap-3 sm:justify-end', CONTROL_W)}>
            <span className="text-body-sm font-semibold text-fg">{value === '1' ? t('settings.on') : t('settings.off')}</span>
            <Switch id={id} name="value" checked={value === '1'} onChange={(on) => onChange(on ? '1' : '0')} />
          </div>
        );
      }
      if (def.unit === 'rupiah') {
        return (
          <div className={CONTROL_W}>
            <RupiahInput
              id={id}
              name="value"
              defaultValue={value === '' ? null : Number(value)}
              onValueChange={(v) => onChange(v === null ? '' : String(v))}
              aria-invalid={invalid || undefined}
              className="h-control-md text-right text-body-sm"
            />
          </div>
        );
      }
      // Value and unit share one bordered control, so long units ("peringkat") never overlap the number.
      return (
        <div
          className={cn(
            'flex h-control-md items-center rounded-control border bg-surface transition-[border-color,box-shadow]',
            'border-border-strong focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15',
            invalid && 'border-danger focus-within:ring-danger/15',
            CONTROL_W,
          )}
        >
          <input
            {...common}
            type="number"
            inputMode="numeric"
            min={def.min}
            max={def.max}
            step={1}
            onChange={(e) => onChange(e.target.value)}
            className="h-full min-w-0 flex-1 bg-transparent pl-3 text-right text-body-sm tabular-nums text-fg outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="shrink-0 whitespace-nowrap pl-2 pr-3 text-caption text-muted">{t(UNIT_LABEL[def.unit])}</span>
        </div>
      );
    case 'enum':
      return (
        <Select {...common} onChange={(e) => onChange(e.target.value)} className={cn('h-control-md text-body-sm', CONTROL_W)}>
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>
              {t.loose(o.labelKey)}
            </option>
          ))}
        </Select>
      );
    case 'time':
      // 24-hour with the locale separator (19.30 / 19:30): native time pickers showed AM/PM to ID crews.
      return (
        <div className={CONTROL_W}>
          <TimeInput
            id={id}
            name="value"
            defaultValue={value}
            onValueChange={(iso) => onChange(iso || value)}
            aria-invalid={invalid || undefined}
            className="h-control-md text-body-sm"
          />
        </div>
      );
    case 'url':
      return (
        <Input
          {...common}
          type="url"
          inputMode="url"
          placeholder="https://"
          onChange={(e) => onChange(e.target.value)}
          className={cn('h-control-md text-body-sm', CONTROL_W)}
        />
      );
  }
}
