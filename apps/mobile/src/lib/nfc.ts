import { inspectTag, ndefLayout, normalizeUid, SimulatedNtag, tokenFromCardUrl, type TagInspection, type Transceive } from '@pats/shared';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/**
 * NFC for the crew and HQ (PLAN.md §4 Phase 2): read a card (UID + NDEF URL in one session) and
 * write one (encode). It needs the development build: Expo Go and the web preview don't ship the
 * native module, so it is loaded lazily and everything degrades to "not available here".
 *
 *   Android  NfcA.transceive (raw NTAG commands)
 *   iOS      Core NFC tag session, MIFARE (NTAG) commands
 */

type NfcModule = typeof import('react-native-nfc-manager');

let mod: NfcModule | null | undefined;
let started: Promise<void> | null = null;

function load(): NfcModule | null {
  if (mod !== undefined) return mod;
  if (Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return (mod = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- native module only exists in the dev build
    mod = require('react-native-nfc-manager') as NfcModule;
  } catch {
    mod = null;
  }
  return mod;
}

export type NfcSupport = 'ready' | 'disabled' | 'unsupported' | 'needsDevBuild';

/**
 * Dev-only chip simulator, for simulators (no NFC) and screenshots: EXPO_PUBLIC_NFC_SIM=blank
 * (a factory-blank NTAG215) or "<uid>,<card url>" (an encoded card). Never active in a release build.
 */
const SIM = __DEV__ ? process.env.EXPO_PUBLIC_NFC_SIM : undefined;
let simTag: SimulatedNtag | null = null;

function simulated(): SimulatedNtag {
  if (simTag) return simTag;
  if (!SIM || SIM === 'blank') return (simTag = new SimulatedNtag('NTAG215', '04A1B2C3D4E5F6'));
  const [uid, url] = SIM.split(',');
  const tag = new SimulatedNtag('NTAG215', uid);
  const layout = ndefLayout(url!, tag.memory.slice(16, 21), tag.chip);
  for (const p of layout.pages) tag.memory.splice(p.page * 4, 4, ...p.data);
  return (simTag = tag);
}

export async function nfcSupport(): Promise<NfcSupport> {
  if (SIM) return 'ready';
  const m = load();
  if (!m) return Platform.OS === 'web' ? 'unsupported' : 'needsDevBuild';
  const manager = m.default;
  try {
    if (!(await manager.isSupported())) return 'unsupported';
    started ??= manager.start();
    await started;
    if (Platform.OS === 'android' && !(await manager.isEnabled())) return 'disabled';
    return 'ready';
  } catch {
    return 'unsupported';
  }
}

export async function openNfcSettings() {
  await load()?.default.goToNfcSetting().catch(() => false);
}

/** The person closed the system NFC sheet (iOS) or the scan was cancelled. */
export class NfcCancelled extends Error {
  constructor() {
    super('NFC_CANCELLED');
  }
}

function isCancel(err: unknown): boolean {
  const name = (err as { constructor?: { name?: string } })?.constructor?.name ?? '';
  const message = String((err as { message?: string })?.message ?? err);
  return name === 'UserCancel' || /cancel/i.test(message);
}

/**
 * One NFC session: waits for a tap, hands `fn` a raw-command transceiver, then closes. On iOS
 * `prompt` is the line in the system sheet and `done` replaces it on success.
 */
export async function withTag<T>(prompt: string, fn: (io: Transceive, tagId: string | null) => Promise<T>, done?: (result: T) => string): Promise<T> {
  if (SIM) {
    const tag = simulated();
    tag.reset();
    await new Promise((r) => setTimeout(r, 600));
    return fn(tag.transceive, null);
  }
  const m = load();
  if (!m) throw new Error('NFC_UNAVAILABLE');
  const { default: manager, NfcTech } = m;
  started ??= manager.start();
  await started;
  try {
    if (Platform.OS === 'ios') {
      await manager.requestTechnology(NfcTech.MifareIOS, { alertMessage: prompt });
    } else {
      await manager.requestTechnology(NfcTech.NfcA, { alertMessage: prompt });
    }
  } catch (err) {
    await manager.cancelTechnologyRequest().catch(() => undefined);
    throw isCancel(err) ? new NfcCancelled() : err;
  }
  try {
    const tag = await manager.getTag();
    const io: Transceive = Platform.OS === 'ios' ? (c) => manager.sendMifareCommandIOS(c) : (c) => manager.nfcAHandler.transceive(c);
    const result = await fn(io, tag?.id ? normalizeUid(tag.id) : null);
    if (Platform.OS === 'ios' && done) await manager.setAlertMessageIOS(done(result)).catch(() => undefined);
    return result;
  } catch (err) {
    if (Platform.OS === 'ios') await manager.invalidateSessionWithErrorIOS(String((err as Error)?.message ?? '')).catch(() => undefined);
    throw isCancel(err) ? new NfcCancelled() : err;
  } finally {
    await manager.cancelTechnologyRequest().catch(() => undefined);
  }
}

export interface ReadCard {
  uid: string;
  /** The PATS card token from the NDEF URL, or null for a blank or foreign tag. */
  token: string | null;
  url: string | null;
  tag: TagInspection;
}

/**
 * Reads a tapped card for check-in and hand-over: UID (from the chip's own pages, cross-checked
 * with the platform's tag ID) and the NDEF URL, in one session. Writes nothing.
 */
export async function readCard(prompt: string, done: string): Promise<ReadCard> {
  return withTag(
    prompt,
    async (io, platformId) => {
      const tag = await inspectTag(io);
      if (platformId && platformId !== tag.uid) throw new Error(`UID mismatch ${platformId} / ${tag.uid}`);
      return { uid: tag.uid, url: tag.url, token: tag.url ? tokenFromCardUrl(tag.url) : null, tag };
    },
    () => done,
  );
}
