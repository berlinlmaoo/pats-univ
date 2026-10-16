'use client';

import { Plus } from 'lucide-react';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { useT } from '@/components/i18n/provider';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import type { ActionResult } from '@/lib/hq/action-result';
import { createAdminAction, setAdminActiveAction } from '@/lib/hq/admins';

export function AddAdminButton({ cities }: { cities: { id: string; name: string }[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={cities.length === 0}>
        <Plus aria-hidden="true" />
        {t('admins.invite')}
      </Button>
      <AddAdminForm key={String(open)} open={open} onClose={() => setOpen(false)} cities={cities} />
    </>
  );
}

function AddAdminForm({ open, onClose, cities }: { open: boolean; onClose: () => void; cities: { id: string; name: string }[] }) {
  const t = useT();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(createAdminAction, null);
  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);
  const err = (field: string) => (state && !state.ok && state.fields?.[field] ? t.loose(state.fields[field]) : undefined);

  return (
    <Dialog open={open} onClose={onClose} title={t('admins.inviteTitle')} description={t('admins.inviteBody')}>
      <form action={action} noValidate className="flex flex-col gap-4 pb-2">
        <input type="hidden" name="locale" value={t.locale} />
        <Field label={t('admins.name')} htmlFor="name" error={err('name')}>
          <Input id="name" name="name" autoComplete="off" aria-invalid={Boolean(err('name'))} />
        </Field>
        <Field label={t('admins.email')} htmlFor="email" error={err('email')}>
          <Input id="email" name="email" type="email" autoCapitalize="none" spellCheck={false} aria-invalid={Boolean(err('email'))} />
        </Field>
        <Field label={t('admins.phone')} htmlFor="phone" error={err('phone')}>
          <Input id="phone" name="phone" type="tel" placeholder={t('join.phonePlaceholder')} aria-invalid={Boolean(err('phone'))} />
        </Field>
        <Field label={t('admins.city')} htmlFor="cityId" error={err('cityId')}>
          <Select id="cityId" name="cityId" defaultValue="">
            <option value="" disabled>
              {t('join.cityPlaceholder')}
            </option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        {state && !state.ok && state.message && <Alert tone="danger">{t.loose(state.message)}</Alert>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={pending}>
            {pending ? t('common.saving') : t('admins.invite')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function AdminRowActions({ admin }: { admin: { id: string; name: string; active: boolean } }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => (admin.active ? setOpen(true) : start(() => void setAdminActiveAction(admin.id, true)))} loading={pending && !open}>
        {admin.active ? t('admins.deactivate') : t('admins.reactivate')}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('admins.deactivateTitle', { name: admin.name })}
        body={t('admins.deactivateBody')}
        confirmLabel={t('admins.deactivate')}
        destructive
        busy={pending}
        onConfirm={() =>
          start(async () => {
            await setAdminActiveAction(admin.id, false);
            setOpen(false);
          })
        }
      />
    </>
  );
}
