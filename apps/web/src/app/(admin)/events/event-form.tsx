'use client';

import { Pencil, Plus } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useT } from '@/components/i18n/provider';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import type { ActionResult } from '@/lib/hq/action-result';
import { saveEventAction } from '@/lib/hq/events';

export interface CityOption {
  id: string;
  name: string;
  zoneLabel: string;
  venues: { id: string; name: string }[];
}

export interface EventFormValues {
  title: string;
  description: string;
  cityId: string;
  venueId: string;
  date: string;
  startTime: string;
  endTime: string;
  opensBeforeMinutes: number;
  capacity: number | null;
  publish: boolean;
}

/** "New event" button, or "Edit" on an event page when `event` is given. */
export function EventDialogButton({
  cities,
  defaults,
  event,
}: {
  cities: CityOption[];
  defaults: { opensBeforeMinutes: number; date: string };
  event?: { id: string; values: EventFormValues; cityLocked: boolean };
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      {event ? (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Pencil aria-hidden="true" />
          {t('common.edit')}
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)} disabled={cities.length === 0}>
          <Plus aria-hidden="true" />
          {t('events.add')}
        </Button>
      )}
      <EventForm key={String(open)} open={open} onClose={() => setOpen(false)} cities={cities} defaults={defaults} event={event} />
    </>
  );
}

function EventForm({
  open,
  onClose,
  cities,
  defaults,
  event,
}: {
  open: boolean;
  onClose: () => void;
  cities: CityOption[];
  defaults: { opensBeforeMinutes: number; date: string };
  event?: { id: string; values: EventFormValues; cityLocked: boolean };
}) {
  const t = useT();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveEventAction.bind(null, event?.id ?? null), null);
  const v = event?.values;
  const [cityId, setCityId] = useState(v?.cityId ?? cities[0]?.id ?? '');
  const city = cities.find((c) => c.id === cityId);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) onClose();
    // DESIGN.md §8.7: the first invalid field gets focus (and scrolls into view).
    else if (state) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state, onClose]);
  const range: Record<string, { min: number; max: number }> = { opensBeforeMinutes: { min: 0, max: 720 }, capacity: { min: 1, max: 100_000 } };
  const err = (field: string) => (state && !state.ok && state.fields?.[field] ? t.loose(state.fields[field], range[field]) : undefined);

  return (
    <Dialog open={open} onClose={onClose} title={event ? t('events.editTitle') : t('events.addTitle')}>
      <form ref={formRef} action={action} noValidate className="flex flex-col gap-4 pb-2">
        <Field label={t('events.eventTitle')} htmlFor="title" error={err('title')}>
          <Input id="title" name="title" defaultValue={v?.title} placeholder={t('events.eventTitlePlaceholder')} aria-invalid={Boolean(err('title'))} autoFocus />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('events.city')} htmlFor="cityId" error={err('cityId') ?? (event?.cityLocked ? t('events.cityLocked') : undefined)}>
            {event?.cityLocked ? (
              <>
                <input type="hidden" name="cityId" value={cityId} />
                <Input id="cityId" value={city?.name ?? ''} readOnly className="read-only:bg-surface-muted read-only:text-muted" />
              </>
            ) : (
              <Select id="cityId" name="cityId" value={cityId} onChange={(e) => setCityId(e.target.value)} aria-invalid={Boolean(err('cityId'))}>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('events.venue')} htmlFor="venueId" error={err('venueId')}>
            <Select id="venueId" name="venueId" key={cityId} defaultValue={v?.cityId === cityId ? v.venueId : ''}>
              <option value="">{t('events.venueNone')}</option>
              {city?.venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <Field label={t('events.date')} htmlFor="date" error={err('date')} className="col-span-2 sm:col-span-1">
            <Input id="date" name="date" type="date" defaultValue={v?.date ?? defaults.date} aria-invalid={Boolean(err('date'))} />
          </Field>
          <Field label={`${t('events.startTime')} (${city?.zoneLabel ?? ''})`} htmlFor="startTime" error={err('startTime')}>
            <Input id="startTime" name="startTime" type="time" defaultValue={v?.startTime ?? '20:00'} aria-invalid={Boolean(err('startTime'))} />
          </Field>
          <Field label={t('events.endTime')} htmlFor="endTime" error={err('endTime')}>
            <Input id="endTime" name="endTime" type="time" defaultValue={v?.endTime ?? '02:00'} aria-invalid={Boolean(err('endTime'))} />
          </Field>
        </div>
        {!err('date') && !err('startTime') && !err('endTime') && <p className="-mt-2 text-caption text-muted">{t('events.endHint')}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('events.opensBefore')} htmlFor="opensBeforeMinutes" hint={t('events.opensBeforeHint')} error={err('opensBeforeMinutes')}>
            <div className="relative">
              <Input
                id="opensBeforeMinutes"
                name="opensBeforeMinutes"
                type="number"
                inputMode="numeric"
                min={0}
                max={720}
                defaultValue={v?.opensBeforeMinutes ?? defaults.opensBeforeMinutes}
                aria-invalid={Boolean(err('opensBeforeMinutes'))}
                className="pr-14 tabular-nums"
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-body-sm text-muted">{t('settings.unitMinutes')}</span>
            </div>
          </Field>
          <Field label={t('events.capacity')} htmlFor="capacity" hint={t('events.capacityHint')} error={err('capacity')} optionalLabel={t('common.optional')}>
            <Input
              id="capacity"
              name="capacity"
              type="number"
              inputMode="numeric"
              min={1}
              defaultValue={v?.capacity ?? ''}
              aria-invalid={Boolean(err('capacity'))}
              className="tabular-nums"
            />
          </Field>
        </div>
        <Field label={t('events.description')} htmlFor="description" error={err('description')} optionalLabel={t('common.optional')}>
          <Textarea id="description" name="description" rows={3} defaultValue={v?.description} placeholder={t('events.descriptionPlaceholder')} />
        </Field>
        <label className="flex cursor-pointer items-start gap-3 rounded-control border border-border px-3.5 py-3 hover:bg-surface-hover">
          <input type="checkbox" name="publish" defaultChecked={v?.publish ?? true} className="mt-0.5 size-4.5 shrink-0 cursor-pointer accent-accent" />
          <span className="min-w-0">
            <span className="block text-body-sm font-medium text-fg">{t('events.publish')}</span>
            <span className="block text-caption text-muted">{t('events.publishHint')}</span>
          </span>
        </label>
        {state && !state.ok && state.message && <Alert tone="danger">{t.loose(state.message)}</Alert>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={pending}>
            {pending ? t('common.saving') : event ? t('common.saveChanges') : t('events.create')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
