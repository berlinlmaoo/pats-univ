'use server';

import { emailSchema, fieldErrors, phoneSchema } from '@pats/shared';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma';
import { audit } from '../audit';
import { revokeAllSessions } from '../auth/sessions';
import { db } from '../db';
import type { ActionResult } from './action-result';
import { requireHq } from './guard';

const adminSchema = z.object({
  name: z.string().trim().min(2, 'validation.nameTooShort').max(80, 'validation.tooLong'),
  email: emailSchema,
  phone: phoneSchema,
  cityId: z.string().min(1, 'validation.cityRequired'),
  locale: z.enum(['id', 'en']).default('id'),
});

/** Adds a LOCAL_ADMIN bound to one city. They log in to the app with this email. */
export async function createAdminAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const hq = await requireHq();
  const parsed = adminSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
  const city = await db.city.findUnique({ where: { id: parsed.data.cityId } });
  if (!city) return { ok: false, fields: { cityId: 'errors.cityNotFound' } };
  try {
    const user = await db.user.create({ data: { ...parsed.data, role: 'LOCAL_ADMIN' } });
    await audit(hq.id, 'admin.created', { type: 'User', id: user.id }, { cityId: city.id, email: user.email });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { ok: false, fields: { email: 'admins.emailTaken' } };
    }
    throw err;
  }
  revalidatePath('/admins');
  return { ok: true, message: 'admins.created' };
}

export async function setAdminActiveAction(userId: string, active: boolean): Promise<ActionResult> {
  const hq = await requireHq();
  const user = await db.user.findFirst({ where: { id: userId, role: 'LOCAL_ADMIN' } });
  if (!user) return { ok: false, message: 'errors.notFound' };
  await db.user.update({ where: { id: userId }, data: { status: active ? 'ACTIVE' : 'DISABLED' } });
  if (!active) await revokeAllSessions(userId);
  await audit(hq.id, active ? 'admin.reactivated' : 'admin.deactivated', { type: 'User', id: userId });
  revalidatePath('/admins');
  return { ok: true };
}
