'use server';

import { isSettingKey, settingId, settingValueSchema } from '@pats/shared';
import { revalidatePath } from 'next/cache';
import { audit } from '../audit';
import { db } from '../db';
import type { ActionResult } from './action-result';
import { requireHq } from './guard';

/** Saves one GLOBAL setting. Values are validated against the key's definition. */
export async function saveSettingAction(key: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const hq = await requireHq();
  if (!isSettingKey(key)) return { ok: false, message: 'errors.notFound' };
  const parsed = settingValueSchema(key).safeParse(String(form.get('value') ?? '').trim());
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'validation.invalid';
    return { ok: false, fields: { value: message.startsWith('validation.') ? message : 'validation.invalid' } };
  }
  const id = settingId(key);
  const before = await db.setting.findUnique({ where: { id } });
  await db.setting.upsert({
    where: { id },
    create: { id, key, scope: 'GLOBAL', value: parsed.data, updatedById: hq.id },
    update: { value: parsed.data, updatedById: hq.id },
  });
  await audit(hq.id, 'setting.updated', { type: 'Setting', id }, { from: before?.value ?? null, to: parsed.data });
  revalidatePath('/settings');
  return { ok: true };
}
