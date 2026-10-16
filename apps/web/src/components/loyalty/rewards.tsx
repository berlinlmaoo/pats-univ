'use client';
import { useState, type FormEvent } from 'react';
import { Gift, Plus } from 'lucide-react';
import Link from 'next/link';
import {
  fieldErrors,
  formatCount,
  rewardInput,
  type RewardDto,
} from '@pats/shared';
import { useT } from '@/components/i18n/provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { postJson } from '@/lib/client/api';
import { DataState, useLoyalty } from './state';

export function RewardsPage() {
  const t = useT();
  const state = useLoyalty<{
    rewards: RewardDto[];
    cities: { id: string; name: string }[];
  }>('/api/admin/loyalty/rewards');
  const [editing, setEditing] = useState<RewardDto | 'new' | null>(null);
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('loyalty.title')}
        description={t('loyalty.subtitle')}
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus />
            {t('loyalty.newReward')}
          </Button>
        }
      />
      <div className="flex flex-wrap gap-4 text-body-sm text-accent-fg">
        <Link href="/settings">{t('loyalty.settings')}</Link>
        <Link href="/leaderboard">{t('loyalty.leaderboard')}</Link>
      </div>
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
              {state.data.rewards.map((r) => (
                <Card key={r.id} className="space-y-3 p-5">
                  <div className="flex flex-wrap justify-between gap-2">
                    <h2 className="text-title3 break-words">{r.name}</h2>
                    <span className="text-caption text-muted">
                      {t.loose(`loyalty.${r.type}`)}
                    </span>
                  </div>
                  <p className="text-body-sm text-muted break-words">
                    {r.description}
                  </p>
                  <p className="text-title2 tabular-nums">
                    {formatCount(r.xpCost)} XP
                  </p>
                  <p className="text-caption text-muted">
                    {r.cityId
                      ? state.data!.cities.find((c) => c.id === r.cityId)?.name
                      : t('loyalty.global')}{' '}
                    ·{' '}
                    {r.stock === null
                      ? t('loyalty.unlimited')
                      : t('loyalty.stockLeft', {
                          count: formatCount(r.stock),
                        })}{' '}
                    · {t('loyalty.weight')}: {formatCount(r.spinWeight)}
                  </p>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-caption text-muted">
                      {r.active ? t('loyalty.active') : t('common.inactive')}
                    </span>
                    <Button variant="secondary" onClick={() => setEditing(r)}>
                      {t('common.edit')}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
          {editing && (
            <RewardForm
              key={typeof editing === 'string' ? editing : editing.id}
              reward={editing === 'new' ? undefined : editing}
              cities={state.data.cities}
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
  cities,
  close,
  saved,
}: {
  reward?: RewardDto;
  cities: { id: string; name: string }[];
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
    const input = rewardInput.safeParse({
      id: reward?.id,
      name: f.get('name'),
      description: f.get('description'),
      type: f.get('type'),
      xpCost: Number(f.get('xpCost')),
      stock: f.get('stock') === '' ? null : Number(f.get('stock')),
      cityId: f.get('cityId') || null,
      spinWeight: Number(f.get('spinWeight')),
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
    >
      <form className="space-y-4 pb-3" onSubmit={submit} noValidate>
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
        <Field htmlFor="reward-type" label={t('loyalty.type')}>
          <Select
            id="reward-type"
            name="type"
            defaultValue={reward?.type ?? 'DIRECT'}
          >
            {['DIRECT', 'SPIN_PRIZE'].map((v) => (
              <option key={v} value={v}>
                {t.loose(`loyalty.${v}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field htmlFor="reward-city" label={t('loyalty.city')}>
          <Select
            id="reward-city"
            name="cityId"
            defaultValue={reward?.cityId ?? ''}
          >
            <option value="">{t('loyalty.global')}</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        {(['xpCost', 'stock', 'spinWeight'] as const).map((key) => (
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
        <label className="flex min-h-11 items-center gap-3 text-body-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={reward?.active ?? true}
          />
          {t('loyalty.active')}
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={busy}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
