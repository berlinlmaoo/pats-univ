'use client';

import { MEMBER_PHOTO_MAX_BYTES } from '@pats/shared';
import { Camera, UserRound } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useT } from '@/components/i18n/provider';
import { Spinner } from '@/components/ui/spinner';
import { ERROR_MESSAGE_KEY } from '@/lib/http/errors';
import { cn } from '@/lib/cn';

/** Longest side sent to the server; phones shoot 4000+ px and venue crew only needs a face. */
const MAX_SIDE = 1200;

/**
 * Re-encodes the picked image as a JPEG of at most MAX_SIDE px (this also turns HEIC from an iPhone
 * into something the server accepts). Falls back to the original file when the browser cannot decode it.
 */
async function prepare(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    return blob ?? file;
  } catch {
    return file;
  }
}

/**
 * Member photo field: pick or shoot a photo, it uploads straight away and the parent receives the
 * storage key. The square preview mirrors what crew see when they scan the card.
 */
export function PhotoPicker({
  id,
  uploadUrl,
  previewUrl,
  onUploaded,
  invalid,
  describedBy,
}: {
  id: string;
  /** POST (join) or PUT (profile) endpoint taking the raw image. */
  uploadUrl: string;
  previewUrl: string | null;
  onUploaded: (result: { key?: string; previewUrl: string | null }) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  const statusId = useId();

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    const body = await prepare(file);
    if (body.size > MEMBER_PHOTO_MAX_BYTES) {
      setBusy(false);
      setError(t('validation.photoTooLarge'));
      return;
    }
    const objectUrl = URL.createObjectURL(body);
    try {
      const res = await fetch(uploadUrl, { method: uploadUrl.startsWith('/api/me') ? 'PUT' : 'POST', headers: { 'Content-Type': body.type || 'image/jpeg' }, body });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const field = json?.error?.fields?.photo as string | undefined;
        const code = json?.error?.code as keyof typeof ERROR_MESSAGE_KEY | undefined;
        setError(t.loose(field ?? (code && ERROR_MESSAGE_KEY[code]) ?? 'errors.generic', { px: 256, ...(json?.params ?? {}) }));
        URL.revokeObjectURL(objectUrl);
        return;
      }
      setLocal((old) => {
        if (old) URL.revokeObjectURL(old);
        return objectUrl;
      });
      onUploaded({ key: json?.key, previewUrl: json?.previewUrl ?? json?.member?.photoUrl ?? null });
    } catch {
      setError(t('errors.network'));
      URL.revokeObjectURL(objectUrl);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  const shown = local ?? previewUrl;
  return (
    <div className="flex items-center gap-4">
      <div
        className={cn(
          'relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-sm border bg-surface-muted text-muted',
          invalid || error ? 'border-danger' : 'border-border-strong',
        )}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL or a signed private URL
          <img src={shown} alt={t('join.photoAlt')} className="size-full object-cover" />
        ) : (
          <UserRound className="size-9" strokeWidth={1.5} aria-hidden="true" />
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-scrim text-on-solid">
            <Spinner className="size-5" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <label
          className={cn(
            'inline-flex h-control-md cursor-pointer items-center gap-2 rounded-control border border-border-strong bg-surface px-4 text-body-sm font-bold text-fg shadow-soft transition-colors hover:bg-surface-hover',
            'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent',
            busy && 'pointer-events-none opacity-60',
          )}
        >
          <input
            ref={input}
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="sr-only"
            aria-invalid={invalid || Boolean(error) || undefined}
            aria-describedby={[describedBy, error ? `${statusId}-error` : null].filter(Boolean).join(' ') || undefined}
            onChange={(e) => void pick(e.target.files?.[0])}
            disabled={busy}
          />
          <Camera className="size-4" strokeWidth={2} aria-hidden="true" />
          {busy ? t('join.photoUploading') : shown ? t('join.photoChange') : t('join.photoChoose')}
        </label>
        <p aria-live="polite" id={`${statusId}-error`} className={cn('mt-1.5 text-caption', error ? 'text-danger-fg' : 'sr-only')}>
          {error ?? (busy ? t('join.photoUploading') : '')}
        </p>
      </div>
    </div>
  );
}
