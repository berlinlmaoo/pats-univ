import 'server-only';
import { ageOn, parseIsoDate, type Registration, type RegistrationResponse } from '@pats/shared';
import { Prisma } from '@/generated/prisma';
import { db } from './db';
import { welcomeEmail } from './email/templates';
import { AppError } from './http/errors';
import { sendMail, smtpConfigured } from './mail';
import { allocateNim } from './nim';
import { getSetting } from './settings';

/**
 * Checks everything that can be checked before the email is verified, so nobody receives a
 * code for a registration that would be refused anyway. Nothing is stored here.
 */
export async function precheckRegistration(input: Registration) {
  const city = await db.city.findFirst({ where: { id: input.cityId, active: true } });
  if (!city) throw new AppError('CITY_NOT_FOUND', 422, 'City not found', { fields: { cityId: 'errors.cityNotFound' } });

  const minAge = await getSetting(db, 'minAge');
  const dob = parseIsoDate(input.dateOfBirth)!;
  if (ageOn(dob, new Date(), city.timezone) < minAge) {
    throw new AppError('UNDERAGE', 422, 'Below minimum age', {
      fields: { dateOfBirth: 'errors.underage' },
      params: { age: minAge },
    });
  }

  const existing = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw new AppError('EMAIL_TAKEN', 409, 'Email already registered', { fields: { email: 'errors.emailTaken' } });

  return city;
}

/** Creates user + member + card (NOT_PRINTED) with a fresh NIM. Call after the OTP is consumed. */
export async function registerMember(input: Registration): Promise<RegistrationResponse> {
  const city = await precheckRegistration(input);
  const dob = parseIsoDate(input.dateOfBirth)!;

  let created;
  try {
    created = await db.$transaction(async (tx) => {
      const nim = await allocateNim(tx, city);
      const user = await tx.user.create({
        data: {
          email: input.email,
          phone: input.phone,
          name: input.fullName,
          role: 'MEMBER',
          locale: input.locale,
          member: {
            create: {
              nim,
              fullName: input.fullName,
              dateOfBirth: new Date(Date.UTC(dob.year, dob.month - 1, dob.day)),
              cityId: city.id,
              favoriteSong: input.favoriteSong,
              favoriteGenre: input.favoriteGenre,
              quotes: input.quotes,
              signupSource: input.source || null,
              consentAt: new Date(),
              cards: { create: { status: 'NOT_PRINTED' } },
            },
          },
        },
        include: { member: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'member.registered',
          targetType: 'Member',
          targetId: user.member!.id,
          meta: { nim, cityCode: city.code, source: input.source ?? null },
        },
      });
      return { user, nim };
    });
  } catch (err) {
    // Two tabs submitting the same email at once.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError('EMAIL_TAKEN', 409, 'Email already registered', { fields: { email: 'errors.emailTaken' } });
    }
    throw err;
  }

  const [ios, android] = await Promise.all([getSetting(db, 'appStoreUrl'), getSetting(db, 'playStoreUrl')]);

  if (smtpConfigured()) {
    // Best effort: the success screen already shows everything in this email.
    sendMail(
      welcomeEmail({
        to: input.email,
        locale: input.locale,
        name: input.fullName,
        nim: created.nim,
        cityName: city.name,
        waGroupUrl: city.waGroupUrl,
      }),
    ).catch((err) => console.error('[join] welcome email failed', String(err)));
  }

  return {
    nim: created.nim,
    fullName: input.fullName,
    city: { id: city.id, code: city.code, name: city.name, waGroupUrl: city.waGroupUrl },
    appLinks: { ios: ios || null, android: android || null },
    emailSent: smtpConfigured(),
  };
}
