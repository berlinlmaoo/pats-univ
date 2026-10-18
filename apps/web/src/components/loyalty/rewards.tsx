'use client';
import { useState, type FormEvent } from 'react';
import { Gift, Plus, SlidersHorizontal } from 'lucide-react';
import {
  fieldErrors,
  formatCount,
  rewardInput,
  type RewardDto,
} from '@pats/shared';
import { useT } from '@/components/i18n/provider';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { Switch } from '@/components/ui/switch';
import { LoyaltyTabs } from './tabs';
import { postJson } from '@/lib/client/api';
import { DataState, useLoyalty } from './state';

export function RewardsPage({ hq = false }: { hq?: boolean }) {
  const t = useT();
  const state = useLoyalty<{
    rewards: RewardDto[];
    cities: { id: string; name: string }[];
    venues: { id: string; name: string; cityId: string }[];
  }>('/api/admin/loyalty/rewards');
  const [editing, setEditing] = useState<RewardDto | 'new' | null>(null);
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('loyalty.title')}
        description={t('loyalty.subtitle')}
        actions={
          <>
            {hq && (
              <ButtonLink href="/settings" variant="secondary">
                <SlidersHorizontal aria-hidden="true" />
                {t('loyalty.settings')}
              </ButtonLink>
            )}
            <Button onClick={() => setEditing('new')}>
              <Plus aria-hidden="true" />
              {t('loyalty.newReward')}
            </Button>
          </>
        }
      />
      <LoyaltyTabs active="/rewards" hq={hq} />
      {!state.data ? (
        <DataState error={state.error} reload={state.reload} />
      ) : (
        <>
          {state.error && (
            <DataState error={state.error} reload={state.reload} />
          )}
          {!state.data.rewards.length ? (
            <Card>
              <EmptyState
                icon={Gift}
                title={t('loyalty.emptyRewards')}
                body={t('loyalty.emptyRewardsBody')}
                action={
                  <Button onClick={() => setEditing('new')}>
                    {t('loyalty.newReward')}
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {state.data.rewards.map((r) => {
                const venue = state.data!.venues.find((v) => v.id === r.venueId)?.name;
                const city = r.cityId ? state.data!.cities.find((c) => c.id === r.cityId)?.name : t('loyalty.global');
                return (
                  <Card key={r.id} className="flex flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="min-w-0 break-words text-title3 text-fg">{r.name}</h2>
                      <Badge tone={r.active ? 'success' : 'neutral'} dot>
                        {r.active ? t('loyalty.active') : t('common.inactive')}
                      </Badge>
                    </div>
                    {r.description && <p className="mt-1.5 break-words text-body-sm text-muted">{r.description}</p>}
                    <p className="ktm-value mt-4 text-title2 tabular-nums text-fg">{formatCount(r.xpCost)} XP</p>
                    <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 border-t border-border pt-3 text-body-sm">
                      <dt className="ktm-label self-center text-muted">{t('phase5.venue')}</dt>
                      <dd className="min-w-0 break-words text-fg">
                        {venue ?? <Badge tone="warning">{t('loyalty.noVenue')}</Badge>}
                      </dd>
                      <dt className="ktm-label self-center text-muted">{t('loyalty.city')}</dt>
                      <dd className="min-w-0 break-words text-fg">{city}</dd>
                      <dt className="ktm-label self-center text-muted">{t('loyalty.stockLabel')}</dt>
                      <dd className="tabular-nums text-fg">{r.stock === null ? t('loyalty.unlimited') : formatCount(r.stock)}</dd>
                      {r.type !== 'DIRECT' && (
                        <>
                          <dt className="ktm-label self-center text-muted">{t('loyalty.type')}</dt>
                          <dd className="text-fg">{t.loose(`loyalty.${r.type}`)}</dd>
                        </>
                      )}
                    </dl>
                    <div className="mt-4 flex justify-end">
                      <Button variant="secondary" onClick={() => setEditing(r)}>
                        {t('common.edit')}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
          {editing && (
            <RewardForm
              key={typeof editing === 'string' ? editing : editing.id}
              reward={editing === 'new' ? undefined : editing}
              venues={state.data.venues}
              close={() => setEditing(null)}
              saved={() => {
                setEditing(null);
                void state.reload();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
function RewardForm({
  reward,
  venues,
  close,
  saved,
}: {
  reward?: RewardDto;
  venues: { id: string; name: string; cityId: string }[];
  close: () => void;
  saved: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (!f.get('venueId')) {
      setFields({ venueId: 'validation.required' });
      form.querySelector<HTMLElement>('[name="venueId"]')?.focus();
      return;
    }
    const input = rewardInput.safeParse({
      id: reward?.id,
      name: f.get('name'),
      description: f.get('description'),
      type: 'DIRECT',
      xpCost: Number(f.get('xpCost')),
      stock: f.get('stock') === '' ? null : Number(f.get('stock')),
      venueId: f.get('venueId'),
      cityId: venues.find(v => v.id === f.get('venueId'))?.cityId ?? null,
      spinWeight: 0,
      active: f.has('active'),
    });
    if (!input.success) {
      const errors = fieldErrors(input.error);
      setFields(errors);
      form
        .querySelector<HTMLElement>(`[name="${Object.keys(errors)[0]}"]`)
        ?.focus();
      return;
    }
    setBusy(true);
    setError('');
    setFields({});
    const r = await postJson('/api/admin/loyalty/rewards', input.data);
    setBusy(false);
    if (r.ok) saved();
    else {
      setError(r.error.messageKey);
      setFields(r.error.fields);
    }
  }
  return (
    <Dialog
      open
      onClose={close}
      title={t(reward ? 'loyalty.editReward' : 'loyalty.newReward')}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
          {t('common.cancel')}
          </Button>
          <Button type="submit" form="reward-form" loading={busy}>
          {t('common.save')}
          </Button>
          
        </>
      }
    >
      <form id="reward-form" className="space-y-4 pb-3" onSubmit={submit} noValidate>
        {error && (
          <p role="alert" className="text-danger-fg">
            {t.loose(error)}
          </p>
        )}
        <Field
          htmlFor="reward-name"
          label={t('loyalty.name')}
          error={fields.name ? t('validation.required') : undefined}
        >
          <Input
            id="reward-name"
            name="name"
            aria-invalid={!!fields.name}
            aria-describedby={fields.name ? 'reward-name-error' : undefined}
            defaultValue={reward?.name}
            required
            maxLength={120}
          />
        </Field>
        <Field htmlFor="reward-description" label={t('loyalty.description')}>
          <Textarea
            id="reward-description"
            name="description"
            defaultValue={reward?.description}
          />
        </Field>
        <Field
          htmlFor="reward-venue"
          label={`${t('phase5.venue')} *`}
          hint={t('loyalty.venueHint')}
          error={fields.venueId ? t('loyalty.venueRequired') : undefined}
        >
          <Select
            id="reward-venue"
            name="venueId"
            defaultValue={reward?.venueId ?? ''}
            required
            aria-invalid={!!fields.venueId}
            aria-describedby={fields.venueId ? 'reward-venue-error' : 'reward-venue-hint'}
          >
            <option value="" disabled>
              {t('loyalty.chooseVenue')}
            </option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        </Field>
        {(['xpCost', 'stock'] as const).map((key) => (
          <Field
            key={key}
            htmlFor={`reward-${key}`}
            label={t(
              key === 'xpCost'
                ? 'loyalty.cost'
                : key === 'stock'
                  ? 'loyalty.stock'
                  : 'loyalty.weight',
            )}
            error={fields[key] ? t('validation.numberInvalid') : undefined}
          >
            <Input
              id={`reward-${key}`}
              name={key}
              aria-invalid={!!fields[key]}
              aria-describedby={fields[key] ? `reward-${key}-error` : undefined}
              type="number"
              min={0}
              defaultValue={reward?.[key] ?? (key === 'stock' ? '' : 0)}
            />
          </Field>
        ))}
        <Switch
          id="reward-active"
          name="active"
          onValue="on"
          offValue={null}
          defaultChecked={reward?.active ?? true}
          label={t('loyalty.active')}
          description={t('loyalty.activeHint')}
        />
      </form>
    </Dialog>
  );
}
