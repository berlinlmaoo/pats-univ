'use server';

import { cityCodeSchema, fieldErrors } from '@pats/shared';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma';
import { audit } from '../audit';
import { db } from '../db';
import type { ActionResult } from './action-result';
import { requireHq } from './guard';

const TIMEZONES = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'] as const;

const citySchema = z.object({
  code: cityCodeSchema,
  name: z.string().trim().min(2, 'validation.required').max(60, 'validation.tooLong'),
  timezone: z.enum(TIMEZONES, 'validation.timezoneInvalid'),
  waGroupUrl: z.union([z.literal(''), z.url({ protocol: /^https$/, error: 'validation.urlInvalid' })]),
});

/** Create (no id) or update a city. The code is the NIM prefix, so it locks once members exist. */
export async function saveCityAction(cityId: string | null, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const hq = await requireHq();
  const parsed = citySchema.safeParse({
    code: form.get('code') ?? '',
    name: form.get('name') ?? '',
    timezone: form.get('timezone') ?? '',
    waGroupUrl: String(form.get('waGroupUrl') ?? '').trim(),
  });
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
  const input = { ...parsed.data, waGroupUrl: parsed.data.waGroupUrl || null };

  try {
    if (cityId) {
      const existing = await db.city.findUnique({ where: { id: cityId }, include: { _count: { select: { members: true } } } });
      if (!existing) return { ok: false, message: 'errors.notFound' };
      if (existing._count.members > 0 && existing.code !== input.code) {
        return { ok: false, fields: { code: 'cities.codeLocked' } };
      }
      await db.city.update({ where: { id: cityId }, data: input });
      await audit(hq.id, 'city.updated', { type: 'City', id: cityId }, input);
    } else {
      const city = await db.city.create({ data: input });
      await audit(hq.id, 'city.created', { type: 'City', id: city.id }, input);
    }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { ok: false, fields: { code: 'cities.codeTaken' } };
    }
    throw err;
  }
  revalidatePath('/cities');
  revalidatePath('/overview');
  return { ok: true, message: cityId ? 'cities.updated' : 'cities.created' };
}
