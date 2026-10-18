'use client';

import { Pencil, Plus } from 'lucide-react';
import { useActionState, useEffect, useState } from 'react';
import { useT } from '@/components/i18n/provider';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import type { ActionResult } from '@/lib/hq/action-result';
import { saveCityAction } from '@/lib/hq/cities';

interface CityValues {
  id: string;
  code: string;
  name: string;
  timezone: string;
  waGroupUrl: string;
  locked: boolean;
}

const TZ_LABEL = { 'Asia/Jakarta': 'cities.tzWib', 'Asia/Makassar': 'cities.tzWita', 'Asia/Jayapura': 'cities.tzWit' } as const;

/** "Add city" button, or an edit button for one row when `city` is given. */
export function CityDialogButton({ city }: { city?: CityValues }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      {city ? (
        <Button variant="ghost" size="sm" className="w-control-sm px-0" aria-label={t('cities.editTitle', { name: city.name })} onClick={() => setOpen(true)}>
          <Pencil aria-hidden="true" />
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus aria-hidden="true" />
          {t('cities.add')}
        </Button>
      )}
      <CityForm key={String(open)} open={open} onClose={() => setOpen(false)} city={city} />
    </>
  );
}

function CityForm({ open, onClose, city }: { open: boolean; onClose: () => void; city?: CityValues }) {
  const t = useT();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveCityAction.bind(null, city?.id ?? null), null);
  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);
  const err = (field: string) => (state && !state.ok && state.fields?.[field] ? t.loose(state.fields[field]) : undefined);

  return (
    <Dialog open={open} onClose={onClose} title={city ? t('cities.editTitle', { name: city.name }) : t('cities.addTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
          {t('common.cancel')}
          </Button>
          <Button type="submit" form="city-form" loading={pending}>
          {pending ? t('common.saving') : city ? t('common.saveChanges') : t('cities.add')}
          </Button>
          
        </>
      }
    >
      <form id="city-form" action={action} noValidate className="flex flex-col gap-4 pb-2">
        <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
          <Field label={t('cities.code')} htmlFor="code" error={err('code')}>
            <Input
              id="code"
              name="code"
              defaultValue={city?.code}
              maxLength={3}
              autoCapitalize="characters"
              readOnly={city?.locked}
              aria-invalid={Boolean(err('code'))}
              className="uppercase tabular-nums read-only:bg-surface-muted read-only:text-muted"
            />
          </Field>
          <Field label={t('cities.name')} htmlFor="name" error={err('name')}>
            <Input id="name" name="name" defaultValue={city?.name} aria-invalid={Boolean(err('name'))} />
          </Field>
        </div>
        {!err('code') && (
          <p className="-mt-2 text-caption text-muted">{city?.locked ? t('cities.codeLocked') : t('cities.codeHint')}</p>
        )}
        <Field label={t('cities.timezone')} htmlFor="timezone" error={err('timezone')}>
          <Select id="timezone" name="timezone" defaultValue={city?.timezone ?? 'Asia/Jakarta'}>
            {Object.entries(TZ_LABEL).map(([tz, key]) => (
              <option key={tz} value={tz}>
                {t(key)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('cities.waGroupUrl')} htmlFor="waGroupUrl" hint={t('cities.waGroupUrlHint')} error={err('waGroupUrl')}>
          <Input
            id="waGroupUrl"
            name="waGroupUrl"
            type="url"
            inputMode="url"
            placeholder="https://chat.whatsapp.com/…"
            defaultValue={city?.waGroupUrl}
            aria-invalid={Boolean(err('waGroupUrl'))}
          />
        </Field>
        {state && !state.ok && state.message && <Alert tone="danger">{t.loose(state.message)}</Alert>}
      </form>
    </Dialog>
  );
}
