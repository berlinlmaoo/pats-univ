/**
 * Domain enums shared by server, dashboard and app. They mirror the Prisma enums in
 * apps/web/prisma/schema.prisma (the server checks they stay in sync at build time).
 */
export const ROLES = ['MEMBER', 'LOCAL_ADMIN', 'SUPER_ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const CARD_STATUSES = [
  'NOT_PRINTED',
  'IN_BATCH',
  'SENT_TO_VENDOR',
  'RECEIVED_HQ',
  'ENCODED',
  'DELIVERED',
  'REVOKED',
] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export const USER_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const MEMBER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const OTP_PURPOSES = ['LOGIN', 'REGISTER'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

/** Values of the `OTP_PROVIDER` env var (PRODUCT.md §10.6). */
export const OTP_PROVIDERS = ['email', 'demo', 'whatsapp-bridge', 'cloud-api'] as const;
export type OtpProvider = (typeof OTP_PROVIDERS)[number];
