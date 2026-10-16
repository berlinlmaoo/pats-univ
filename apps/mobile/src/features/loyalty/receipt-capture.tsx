import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuth } from '@/auth';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { Text } from '@/components/text';
import { useT } from '@/i18n';
import { ApiFailure, errorKey } from '@/lib/api';
import { size, space } from '@/theme';
export function ReceiptCapture({
  value,
  onChange,
}: {
  value: string;
  onChange: (key: string) => void;
}) {
  const t = useT();
  const { call } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const camera = useRef<CameraView>(null);
  async function capture() {
    if (!camera.current) return;
    setBusy(true);
    setError('');
    try {
      const photo = await camera.current.takePictureAsync({
        quality: 0.7,
        base64: true,
      });
      if (!photo?.base64) throw new Error('photo');
      const decoded = atob(photo.base64);
      if (decoded.length > 5 * 1024 * 1024) {
        setError('loyalty.invalidReceipt');
        return;
      }
      const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
      const signed = await call<{ key: string; uploadUrl: string }>(
        'POST',
        '/api/loyalty/receipt-upload',
        { contentType: 'image/jpeg' },
      );
      const response = await fetch(signed.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: bytes,
      });
      if (!response.ok) throw new Error('upload');
      onChange(signed.key);
      setOpen(false);
    } catch (err) {
      setError(
        err instanceof ApiFailure
          ? errorKey(err.code)
          : 'loyalty.invalidReceipt',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={styles.group}>
      <Text variant="bodySm" weight={600}>
        {t('loyalty.receipt')}
      </Text>
      {value && (
        <Text variant="caption" tone="successText">
          {t('loyalty.uploaded')}
        </Text>
      )}
      {error && <Notice tone="danger" text={t.loose(error)} />}
      <Button
        variant="secondary"
        label={t('loyalty.takeReceipt')}
        disabled={busy}
        onPress={() => {
          setOpen(true);
          if (!permission?.granted) void requestPermission();
        }}
      />
      {open &&
        (permission?.granted ? (
          <>
            <View style={styles.camera}>
              <CameraView ref={camera} style={styles.fill} facing="back" />
            </View>
            <Button
              label={t(busy ? 'loyalty.uploading' : 'loyalty.takeReceipt')}
              loading={busy}
              onPress={() => void capture()}
            />
            <Button
              variant="ghost"
              label={t('common.cancel')}
              onPress={() => setOpen(false)}
              disabled={busy}
            />
          </>
        ) : (
          <Notice text={t('loyalty.scanPermission')} />
        ))}
    </View>
  );
}
const styles = StyleSheet.create({
  group: { gap: space[3] },
  camera: { height: size.scanFrame },
  fill: { flex: 1 },
});
