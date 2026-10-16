import type { LoginResponse, OtpRequestResponse } from '@pats/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { OtpField } from '@/components/otp-field';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useI18n } from '@/i18n';
import { api, ApiFailure, errorKey } from '@/lib/api';
import { space } from '@/theme';

export default function VerifyScreen() {
  const params = useLocalSearchParams<{ email: string; demoCode?: string; resendAfter?: string }>();
  const { t, locale } = useI18n();
  const { signIn } = useAuth();
  const [code, setCode] = useState('');
  const [demoCode, setDemoCode] = useState(params.demoCode || '');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(() => Date.now() + Number(params.resendAfter ?? 60) * 1000);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const cooldown = Math.max(0, Math.ceil((resendAt - now) / 1000));

  async function verify(value = code) {
    if (busy) return;
    if (value.length !== 6) return setError(t('validation.otpInvalid'));
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<LoginResponse>('/api/auth/otp/verify', { email: params.email, code: value, client: 'app' });
      await signIn(res);
      router.replace('/');
    } catch (err) {
      const failure = err instanceof ApiFailure ? err : new ApiFailure('INTERNAL');
      if (failure.code !== 'OTP_INVALID') setCode('');
      setError(t.loose(errorKey(failure.code), failure.params));
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    try {
      const res = await api.post<OtpRequestResponse>('/api/auth/otp/request', { email: params.email, locale, audience: 'app' });
      setDemoCode(res.demoCode ?? '');
      setResendAt(Date.now() + res.resendAfter * 1000);
      setNotice(t('otp.resent'));
      setCode('');
    } catch (err) {
      const failure = err instanceof ApiFailure ? err : new ApiFailure('INTERNAL');
      setError(failure.code === 'FORBIDDEN' ? t('auth.appHqOnly') : t.loose(errorKey(failure.code), failure.params));
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text variant="title1" accessibilityRole="header">
          {t('otp.title')}
        </Text>
        <Text variant="body" tone="textMuted">
          {t('otp.subtitle', { email: params.email })} {t('otp.expiresIn')}
        </Text>
      </View>

      {demoCode ? <Notice text={t('otp.demoCode', { code: demoCode })} /> : null}

      <View style={styles.field}>
        <OtpField
          label={t('otp.codeLabel')}
          value={code}
          invalid={Boolean(error)}
          disabled={busy}
          onChange={(v) => {
            setCode(v);
            setError(null);
          }}
          onComplete={(v) => void verify(v)}
        />
        {error ? (
          <Text variant="caption" tone="dangerText" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : notice ? (
          <Text variant="caption" tone="successText">
            {notice}
          </Text>
        ) : null}
      </View>

      <Button label={busy ? t('otp.verifying') : t('otp.verify')} loading={busy} onPress={() => void verify()} />

      <View style={styles.links}>
        <Button variant="ghost" compact label={t('otp.changeEmail')} onPress={() => router.back()} />
        <Button
          variant="ghost"
          compact
          disabled={cooldown > 0}
          label={cooldown > 0 ? t('otp.resendIn', { seconds: cooldown }) : t('otp.resend')}
          onPress={() => void resend()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space[1.5], marginTop: space[8] },
  field: { gap: space[2] },
  links: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', marginHorizontal: -space[3] },
});
