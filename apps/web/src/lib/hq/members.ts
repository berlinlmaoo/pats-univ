'use server';

import { fieldErrors, registrationSchema } from '@pats/shared';
import { revalidatePath } from 'next/cache';
import { audit } from '../audit';
import { revokeAllSessions } from '../auth/sessions';
import { db } from '../db';
import type { ActionResult } from './action-result';
import { requireHq } from './guard';

const editSchema = registrationSchema.pick({ fullName: true, dateOfBirth: true, cityId: true, phone: true });

/** HQ edits a member's core data (name, date of birth, home city, WhatsApp). NIM never changes. */
export async function updateMemberAction(memberId: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const hq = await requireHq();
  const parsed = editSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
  const input = parsed.data;

  const [member, city] = await Promise.all([
    db.member.findUnique({ where: { id: memberId }, include: { user: true } }),
    db.city.findUnique({ where: { id: input.cityId } }),
  ]);
  if (!member) return { ok: false, message: 'errors.notFound' };
  if (!city) return { ok: false, fields: { cityId: 'errors.cityNotFound' } };

  const [y, m, d] = input.dateOfBirth.split('-').map(Number) as [number, number, number];
  const dateOfBirth = new Date(Date.UTC(y, m - 1, d));
  const changed = {
    ...(member.fullName !== input.fullName && { fullName: [member.fullName, input.fullName] }),
    ...(member.dateOfBirth.getTime() !== dateOfBirth.getTime() && { dateOfBirth: true }),
    ...(member.cityId !== input.cityId && { cityId: [member.cityId, input.cityId] }),
    ...(member.user.phone !== input.phone && { phone: true }),
  };
  if (Object.keys(changed).length === 0) return { ok: true };

  await db.member.update({
    where: { id: memberId },
    data: {
      fullName: input.fullName,
      dateOfBirth,
      city: { connect: { id: input.cityId } },
      user: { update: { name: input.fullName, phone: input.phone } },
    },
  });
  await audit(hq.id, 'member.updated', { type: 'Member', id: memberId }, changed);
  revalidatePath(`/members/${memberId}`);
  revalidatePath('/members');
  return { ok: true, message: 'members.updated' };
}

/** Deactivating also signs the member out on every device. */
export async function setMemberActiveAction(memberId: string, active: boolean): Promise<ActionResult> {
  const hq = await requireHq();
  const member = await db.member.findUnique({ where: { id: memberId }, select: { userId: true } });
  if (!member) return { ok: false, message: 'errors.notFound' };
  await db.member.update({
    where: { id: memberId },
    data: {
      status: active ? 'ACTIVE' : 'INACTIVE',
      user: { update: { status: active ? 'ACTIVE' : 'DISABLED' } },
    },
  });
  if (!active) await revokeAllSessions(member.userId);
  await audit(hq.id, active ? 'member.reactivated' : 'member.deactivated', { type: 'Member', id: memberId });
  revalidatePath(`/members/${memberId}`);
  revalidatePath('/members');
  return { ok: true };
}
