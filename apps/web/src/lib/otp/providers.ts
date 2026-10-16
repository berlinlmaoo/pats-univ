import 'server-only';
import type { Locale, OtpProvider as OtpProviderName } from '@pats/shared';
import type { OtpProvider as OtpProviderEnum } from '@/generated/prisma';
import { env } from '../env';
import { otpEmail } from '../email/templates';
import { sendMail } from '../mail';

export interface OtpMessage {
  /** Login identity the code is for (email today; a phone number for the HP providers). */
  to: string;
  code: string;
  purpose: 'LOGIN' | 'REGISTER';
  locale: Locale;
  expiresInMinutes: number;
}

/**
 * How a code reaches the member (PRODUCT.md §10.6). Creating and checking codes never depends
 * on the provider; switching delivery is one env change (`OTP_PROVIDER`).
 */
export interface OtpSender {
  readonly name: OtpProviderName;
  readonly dbValue: OtpProviderEnum;
  /** Returns the code only when it must be shown on screen (demo). */
  send(message: OtpMessage): Promise<{ displayCode?: string }>;
}

class EmailOtpSender implements OtpSender {
  readonly name = 'email' as const;
  readonly dbValue = 'EMAIL' as const;
  async send(message: OtpMessage) {
    await sendMail(otpEmail(message));
    return {};
  }
}

/** Showcase / automated tests: no gateway, the code is returned to the client. */
class DemoOtpSender implements OtpSender {
  readonly name = 'demo' as const;
  readonly dbValue = 'DEMO' as const;
  async send(message: OtpMessage) {
    return { displayCode: message.code };
  }
}

/** Interface only until the phone-OTP path is chosen (T17). */
class NotBuiltOtpSender implements OtpSender {
  constructor(
    readonly name: 'whatsapp-bridge' | 'cloud-api',
    readonly dbValue: 'WHATSAPP_BRIDGE' | 'CLOUD_API',
  ) {}
  async send(): Promise<never> {
    throw new Error(`OTP provider "${this.name}" is not built yet (PRODUCT.md §10.6)`);
  }
}

let sender: OtpSender | null = null;

export function otpSender(): OtpSender {
  if (sender) return sender;
  switch (env().OTP_PROVIDER) {
    case 'email':
      sender = new EmailOtpSender();
      break;
    case 'demo':
      sender = new DemoOtpSender();
      break;
    case 'whatsapp-bridge':
      sender = new NotBuiltOtpSender('whatsapp-bridge', 'WHATSAPP_BRIDGE');
      break;
    case 'cloud-api':
      sender = new NotBuiltOtpSender('cloud-api', 'CLOUD_API');
      break;
  }
  return sender;
}
