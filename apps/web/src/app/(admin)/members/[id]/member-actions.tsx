'use client';

import { Pencil } from 'lucide-react';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { useT } from '@/components/i18n/provider';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-time';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import type { ActionResult } from '@/lib/hq/action-result';
import { setMemberActiveAction, updateMemberAction } from '@/lib/hq/members';

interface MemberCore {
  id: string;
  fullName: string;
  dateOfBirth: string;
  cityId: string;
  phone: string;
  favoriteDrink: string;
  favoriteGenre: string;
  active: boolean;
}

export function MemberActions({ member, cities }: { member: MemberCore; cities: { id: string; name: string }[] }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="flex shrink-0 items-center gap-2">
      {/* Destructive triggers: secondary with danger text; the solid danger button lives in the confirm dialog. */}
      <Button variant="secondary" className={member.active ? 'text-danger-fg hover:text-danger-fg' : undefined} onClick={() => setConfirming(true)}>
        {member.active ? t('members.deactivate') : t('members.reactivate')}
      </Button>
      <Button variant="secondary" onClick={() => setEditing(true)}>
        <Pencil aria-hidden="true" />
        {t('common.edit')}
      </Button>

      <EditMemberDialog key={String(editing)} open={editing} onClose={() => setEditing(false)} member={member} cities={cities} />

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t(member.active ? 'members.deactivateTitle' : 'members.reactivateTitle', { name: member.fullName })}
        body={t(member.active ? 'members.deactivateBody' : 'members.reactivateBody')}
        confirmLabel={member.active ? t('members.deactivate') : t('members.reactivate')}
        destructive={member.active}
        busy={pending}
        onConfirm={() =>
          start(async () => {
            await setMemberActiveAction(member.id, !member.active);
            setConfirming(false);
          })
        }
      />
    </div>
  );
}

function EditMemberDialog({
  open,
  onClose,
  member,
  cities,
}: {
  open: boolean;
  onClose: () => void;
  member: MemberCore;
  cities: { id: string; name: string }[];
}) {
  const t = useT();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    updateMemberAction.bind(null, member.id),
    null,
  );
  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);
  const err = (field: string) => (state && !state.ok && state.fields?.[field] ? t.loose(state.fields[field]) : undefined);

  return (
    <Dialog open={open} onClose={onClose} title={t('members.editTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
          {t('common.cancel')}
          </Button>
          <Button type="submit" form="member-edit-form" loading={pending}>
          {pending ? t('common.saving') : t('common.saveChanges')}
          </Button>
          
        </>
      }
    >
      <form id="member-edit-form" action={action} noValidate className="flex flex-col gap-4 pb-2">
        <Field label={t('members.fullName')} htmlFor="fullName" error={err('fullName')}>
          <Input id="fullName" name="fullName" defaultValue={member.fullName} aria-invalid={Boolean(err('fullName'))} />
        </Field>
        <Field label={t('members.dateOfBirth')} htmlFor="dateOfBirth" error={err('dateOfBirth')}>
          <DateInput id="dateOfBirth" name="dateOfBirth" defaultValue={member.dateOfBirth} aria-invalid={Boolean(err('dateOfBirth'))} />
        </Field>
        <Field label={t('members.city')} htmlFor="cityId" error={err('cityId')}>
          <Select id="cityId" name="cityId" defaultValue={member.cityId}>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('members.phone')} htmlFor="phone" error={err('phone')}>
          <Input id="phone" name="phone" type="tel" defaultValue={member.phone} aria-invalid={Boolean(err('phone'))} />
        </Field>
        <Field label={t('members.drink')} htmlFor="favoriteDrink" error={err('favoriteDrink')} hint={t('members.printedHint')}>
          <Input id="favoriteDrink" name="favoriteDrink" maxLength={40} defaultValue={member.favoriteDrink} aria-invalid={Boolean(err('favoriteDrink'))} />
        </Field>
        <Field label={t('members.genre')} htmlFor="favoriteGenre" error={err('favoriteGenre')} hint={t('members.printedHint')}>
          <Input id="favoriteGenre" name="favoriteGenre" maxLength={50} defaultValue={member.favoriteGenre} aria-invalid={Boolean(err('favoriteGenre'))} />
        </Field>
        {state && !state.ok && state.message && <Alert tone="danger">{t.loose(state.message)}</Alert>}
      </form>
    </Dialog>
  );
}
