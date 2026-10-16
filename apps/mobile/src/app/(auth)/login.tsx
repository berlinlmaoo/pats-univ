import { emailSchema, type OtpRequestResponse } from '@pats/shared';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/components/button';
import { Field, Input } from '@/components/field';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { LanguageToggle } from '@/components/language-toggle';
import { Wordmark } from '@/components/wordmark';
import { useI18n } from '@/i18n';
import { api, ApiFailure, errorKey } from '@/lib/api';
import { JOIN_URL } from '@/lib/config';
import { space } from '@/theme';

export default function LoginScreen() {
  const { t, locale } = useI18n();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setError(t('validation.emailInvalid'));
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<OtpRequestResponse>('/api/auth/otp/request', { email: parsed.data, locale, audience: 'app' });
      router.push({
        pathname: '/verify',
        params: { email: parsed.data, demoCode: res.demoCode ?? '', resendAfter: String(res.resendAfter) },
      });
    } catch (err) {
      const failure = err instanceof ApiFailure ? err : new ApiFailure('INTERNAL');
      setError(failure.code === 'FORBIDDEN' ? t('auth.appHqOnly') : t.loose(errorKey(failure.code), failure.params));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.top}>
        <Wordmark />
        <LanguageToggle />
      </View>

      <View style={styles.body}>
        <View style={styles.header}>
          <Text variant="title1" accessibilityRole="header">
            {t('app.loginTitle')}
          </Text>
          <Text variant="body" tone="textMuted">
            {t('app.loginSubtitle')}
          </Text>
        </View>

        <Field label={t('auth.emailLabel')} error={error ?? undefined}>
          <Input
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setError(null);
            }}
            placeholder={t('join.emailPlaceholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={submit}
            invalid={Boolean(error)}
            accessibilityLabel={t('auth.emailLabel')}
          />
        </Field>

        <Button label={busy ? t('auth.sending') : t('auth.sendCode')} loading={busy} onPress={submit} />
      </View>

      <View style={styles.footer}>
        <Text variant="bodySm" tone="textMuted">
          {t('auth.noAccount')}
        </Text>
        <Pressable accessibilityRole="link" hitSlop={8} onPress={() => void Linking.openURL(JOIN_URL)}>
          <Text variant="bodySm" weight={600} tone="accentText">
            {t('auth.joinLink')}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  body: { flex: 1, justifyContent: 'center', gap: space[5], paddingVertical: space[8] },
  header: { gap: space[1.5] },
  footer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space[1] },
});
