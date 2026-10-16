'use server';

import { emailSchema, fieldErrors, phoneSchema } from '@pats/shared';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createRegionalAdmin, setRegionalAdminActive } from '../membership';
import { AppError } from '../http/errors';
import { db } from '../db';
import { isUniqueViolation } from '../db-errors';
import type { ActionResult } from './action-result';
import { requireHq } from './guard';

const adminSchema = z.object({
  name: z.string().trim().min(2, 'validation.nameTooShort').max(80, 'validation.tooLong'),
  email: emailSchema,
  phone: phoneSchema,
  cityId: z.string().min(1, 'validation.cityRequired'),
  locale: z.enum(['id', 'en']).default('id'),
});

/** Adds a REGIONAL_ADMIN bound to one city. They log in to the app with this email. */
export async function createAdminAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const hq = await requireHq();
  const parsed = adminSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
  const city = await db.city.findUnique({ where: { id: parsed.data.cityId } });
  if (!city) return { ok: false, fields: { cityId: 'errors.cityNotFound' } };
  try {
    await createRegionalAdmin(hq, parsed.data);
  } catch (err) {
    if (err instanceof AppError && err.code === 'ADMIN_LIMIT') return { ok: false, message: 'phase5.adminLimit' };
    if (isUniqueViolation(err)) {
      return { ok: false, fields: { email: 'admins.emailTaken' } };
    }
    throw err;
  }
  revalidatePath('/admins');
  return { ok: true, message: 'admins.created' };
}

export async function setAdminActiveAction(userId: string, active: boolean): Promise<ActionResult> {
  const hq = await requireHq();
  const user = await db.user.findFirst({ where: { id: userId, role: 'REGIONAL_ADMIN' } });
  if (!user) return { ok: false, message: 'errors.notFound' };
  try { await setRegionalAdminActive(hq, userId, active); }
  catch (err) { if (err instanceof AppError && err.code === 'ADMIN_LIMIT') return { ok: false, message: 'phase5.adminLimit' }; throw err; }
  revalidatePath('/admins');
  return { ok: true };
}
