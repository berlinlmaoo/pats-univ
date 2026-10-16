import {
  fromHex,
  inspectTag,
  TagError,
  tokenFromCardUrl,
  writeTag,
  type StationClaimResponse,
  type StationEncodedResponse,
  type StationKeyResponse,
} from '@pats/shared';
import Constants from 'expo-constants';
import { Nfc, Settings } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { useI18n } from '@/i18n';
import { ApiFailure, errorKey } from '@/lib/api';
import { NfcCancelled, nfcSupport, openNfcSettings, withTag, type NfcSupport } from '@/lib/nfc';
import { size, space, useColors } from '@/theme';

export function useNfcSupport() {
  const [support, setSupport] = useState<NfcSupport | null>(null);
  const refresh = useCallback(() => void nfcSupport().then(setSupport), []);
  useEffect(refresh, [refresh]);
  return { support, refresh };
}

/** Why NFC can't be used here, and what to do (open NFC settings, use the dev build, fall back). */
export function NfcUnavailable({ support, fallback }: { support: NfcSupport; fallback: string }) {
  const { t } = useI18n();
  const c = useColors();
  const body = {
    disabled: t('nfc.disabledBody'),
    unsupported: t('nfc.unsupportedBody'),
    needsDevBuild: t('nfc.devBuildBody'),
    ready: '',
  }[support];
  return (
    <Card style={styles.unavailable}>
      <View style={styles.row}>
        <Nfc size={size.icon} color={c.textMuted} strokeWidth={1.75} />
        <Text variant="body" weight={600} style={styles.flex}>
          {support === 'disabled' ? t('nfc.disabledTitle') : t('nfc.unavailableTitle')}
        </Text>
      </View>
      <Text variant="bodySm" tone="textMuted">
        {body} {fallback}
      </Text>
      {support === 'disabled' && Platform.OS === 'android' && (
        <Button variant="secondary" label={t('nfc.openSettings')} icon={<Settings size={size.iconSm} color={c.text} strokeWidth={2} />} onPress={() => void openNfcSettings()} />
      )}
    </Card>
  );
}

/** i18n key for anything an NFC session can throw. */
export function nfcErrorKey(err: unknown): string {
  if (err instanceof NfcCancelled) return 'nfc.cancelled';
  if (err instanceof ApiFailure) return errorKey(err.code);
  if (err instanceof TagError) {
    return (
      {
        NOT_NTAG: 'nfc.notNtag',
        NOT_NDEF_FORMATTED: 'nfc.notFormatted',
        READ_ONLY: 'nfc.readOnly',
        LOCK_BITS_SET: 'nfc.locked',
        WRONG_PASSWORD: 'nfc.wrongPassword',
        WRITE_FAILED: 'nfc.writeFailed',
        VERIFY_FAILED: 'nfc.verifyFailed',
        PROTECT_FAILED: 'nfc.protectFailed',
        TAG_LOST: 'nfc.tagLost',
      } as const
    )[err.code];
  }
  return 'nfc.readFailed';
}

/** How this phone shows up as an encode station on the dashboard. */
export function stationLabel(name: string): string {
  const device = Constants.deviceName || (Platform.OS === 'ios' ? 'iPhone' : 'Android');
  return `${device} · ${name.split(/\s+/)[0] ?? name}`.slice(0, 60);
}

export type EncodeState =
  | { kind: 'idle' }
  | { kind: 'claiming' }
  | { kind: 'confirm'; claim: StationClaimResponse }
  | { kind: 'already'; claim: StationClaimResponse }
  | { kind: 'tapping'; claim: StationClaimResponse }
  | { kind: 'done'; claim: StationClaimResponse; result: StationEncodedResponse; chip: string }
  | {
      kind: 'error';
      key: string;
      params?: Record<string, string | number>;
      claim?: StationClaimResponse;
      /** The chip was written but the server didn't confirm: reporting again is all that's left. */
      pending?: { nfcUid: string; protectedNow: boolean; chipType: string };
    };

/**
 * Encode on a phone (HQ, or a city admin with an approved re-encode): the same steps as the Mac
 * Card Station (PLAN.md §2.2). The password comes from the server for this chip and this write
 * only, and is never kept. A failed write is reported (audited) and leaves the card as it was.
 */
export function useEncode(opts: { reencode?: boolean; grantId?: string; batchId?: string }) {
  const { call, me } = useAuth();
  const { t } = useI18n();
  const [state, setState] = useState<EncodeState>({ kind: 'idle' });
  const station = stationLabel(me?.user.name ?? '');

  const fail = (err: unknown, claim?: StationClaimResponse, pending?: { nfcUid: string; protectedNow: boolean; chipType: string }) => {
    const params = err instanceof ApiFailure ? err.params : undefined;
    setState({ kind: 'error', key: pending ? 'nfc.reportFailed' : nfcErrorKey(err), params, claim, pending });
  };

  const report = useCallback(
    async (claim: StationClaimResponse, pending: { nfcUid: string; protectedNow: boolean; chipType: string }) => {
      const encoded = await call<StationEncodedResponse>('POST', `/api/hq/cards/${claim.card.id}/encoded`, { leaseId: claim.lease!.id, ...pending });
      setState({ kind: 'done', claim, result: encoded, chip: pending.chipType });
    },
    [call],
  );

  const identify = useCallback(
    async (lookup: string) => {
      setState({ kind: 'claiming' });
      try {
        const claim = await call<StationClaimResponse>('POST', '/api/hq/cards/prepare', {
          lookup,
          station,
          mode: opts.reencode || opts.grantId ? 'reencode' : 'encode',
          batchId: opts.batchId,
          grantId: opts.grantId,
        });
        setState(claim.lease ? { kind: 'confirm', claim } : { kind: 'already', claim });
      } catch (err) {
        fail(err);
      }
    },
    [call, station, opts.reencode, opts.grantId, opts.batchId],
  );

  const release = useCallback(
    async (claim: StationClaimResponse, failure?: { code: string; detail: string }) => {
      if (!claim.lease) return;
      await call('POST', `/api/hq/cards/${claim.card.id}/release`, { leaseId: claim.lease.id, failure: failure?.code, detail: failure?.detail?.slice(0, 300) }).catch(() => null);
    },
    [call],
  );

  const write = useCallback(
    async (claim: StationClaimResponse) => {
      const lease = claim.lease!;
      setState({ kind: 'tapping', claim });
      let pending: { nfcUid: string; protectedNow: boolean; chipType: string } | null = null;
      try {
        const result = await withTag(
          t('nfc.encodePrompt', { name: claim.member.fullName }),
          async (io) => {
            const tag = await inspectTag(io);
            const existing = tag.url ? tokenFromCardUrl(tag.url) : null;
            if (existing && !claim.url.endsWith(existing) && !(opts.reencode || opts.grantId)) throw new ApiFailure('UID_IN_USE', { nim: '—' });
            const key = await call<StationKeyResponse>('POST', `/api/hq/cards/${claim.card.id}/key`, { leaseId: lease.id, nfcUid: tag.uid });
            const res = await writeTag(io, tag, { url: key.url, pwd: fromHex(key.pwd), pack: fromHex(key.pack) });
            pending = { nfcUid: tag.uid, protectedNow: res.protectedNow, chipType: tag.chip.type };
            return pending;
          },
          () => t('nfc.encodeDone'),
        );
        await report(claim, result);
      } catch (err) {
        // The chip is written but the server didn't hear back: only the report has to be repeated.
        if (pending) return fail(err, claim, pending);
        await release(claim, err instanceof TagError ? { code: err.code, detail: err.message } : undefined);
        fail(err, err instanceof NfcCancelled ? undefined : claim);
      }
    },
    [call, opts.grantId, opts.reencode, release, report, t],
  );

  const reportAgain = useCallback(async () => {
    if (state.kind !== 'error' || !state.pending || !state.claim) return;
    const { claim, pending } = state;
    try {
      await report(claim, pending);
    } catch (err) {
      fail(err, claim, pending);
    }
  }, [report, state]);

  const cancel = useCallback(async () => {
    if (state.kind === 'confirm') await release(state.claim);
    setState({ kind: 'idle' });
  }, [release, state]);

  const reset = useCallback(() => setState({ kind: 'idle' }), []);
  return { state, identify, write, cancel, reset, reportAgain };
}

const styles = StyleSheet.create({
  unavailable: { padding: space[4], gap: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  flex: { flex: 1 },
});
