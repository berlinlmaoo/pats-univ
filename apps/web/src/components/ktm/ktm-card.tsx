'use client';

import { brand, ktm } from '@pats/shared/tokens';
import { RotateCcw } from 'lucide-react';
import QRCode from 'qrcode';
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useT } from '@/components/i18n/provider';
import { cn } from '@/lib/cn';

/**
 * The KTM exactly as printed (DESIGN.md "KTM card"): the official blank front with the member's
 * values in the card's heavy black caps, a white QR inside the artwork's maroon tile, and the
 * official back on the other side. Everything scales with the card's own width (container query
 * units), so it is identical at 280 px and at 800 px.
 */

/** Figtree's cap top sits ~0.15 em below the top of a line-height-1 box (measured against the card). */
const CAP_OFFSET_EM = 0.15;
const CAP_HEIGHT_EM = 0.7;
/** Base value size in cqw: the measured cap height divided by the face's cap ratio. */
const VALUE_CQW = (ktm.valueCap / CAP_HEIGHT_EM) * 100;
const pct = (n: number) => `${(n * 100).toFixed(3)}%`;

type Side = 'front' | 'back';

export function KtmCard({
  name,
  drink,
  genre,
  qrValue,
  side: controlledSide,
  flippable = true,
  priority = false,
  className,
}: {
  name: string;
  drink: string;
  genre: string;
  /** Encoded in the QR (the card URL). Null/empty leaves the maroon tile empty, as on an unissued card. */
  qrValue?: string | null;
  /** Force one side (e.g. a thumbnail); otherwise the card starts on the front and can flip. */
  side?: Side;
  flippable?: boolean;
  /** Load the artwork eagerly (the hero card of a page). */
  priority?: boolean;
  className?: string;
}) {
  const t = useT();
  const [flipped, setFlipped] = useState(false);
  const side: Side = controlledSide ?? (flipped ? 'back' : 'front');
  const canFlip = flippable && !controlledSide;

  return (
    <div className={cn('@container relative w-full', className)}>
      <div
        className="relative w-full [perspective:1600px]"
        style={{ aspectRatio: `${ktm.ratio}` }}
        role="group"
        aria-label={t('ktm.cardLabel', { name: name || t('ktm.yourName') })}
      >
        <div
          className={cn(
            'absolute inset-0 transition-transform duration-500 ease-standard [transform-style:preserve-3d]',
            'motion-reduce:transition-none',
            side === 'back' && '[transform:rotateY(180deg)] motion-reduce:[transform:none]',
          )}
        >
          <Face side="front" hidden={side !== 'front'}>
            {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized official artwork in public/ktm */}
            <img
              src="/ktm/front-800.webp"
              srcSet="/ktm/front-800.webp 800w, /ktm/front-1600.webp 1600w"
              sizes="(min-width: 640px) 560px, 92vw"
              alt=""
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              draggable={false}
              className="absolute inset-0 size-full select-none object-cover"
            />
            <Value label={t('ktm.name')} value={name} y={ktm.nameY} maxW={ktm.nameMaxW} />
            <Value label={t('ktm.drink')} value={drink} y={ktm.drinkY} maxW={ktm.valueMaxW} />
            <Value label={t('ktm.genre')} value={genre} y={ktm.genreY} maxW={ktm.valueMaxW} />
            {qrValue ? <Qr value={qrValue} label={t('ktm.qrLabel')} /> : null}
          </Face>
          <Face side="back" hidden={side !== 'back'}>
            {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized official artwork in public/ktm */}
            <img
              src="/ktm/back-800.webp"
              srcSet="/ktm/back-800.webp 800w, /ktm/back-1600.webp 1600w"
              sizes="(min-width: 640px) 560px, 92vw"
              alt={t('ktm.backAlt')}
              loading="lazy"
              decoding="async"
              draggable={false}
              className="absolute inset-0 size-full select-none object-cover"
            />
          </Face>
        </div>
      </div>
      {canFlip && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            aria-pressed={flipped}
            className="inline-flex h-10 items-center gap-2 rounded-control px-3 text-caption font-extrabold uppercase tracking-[0.06em] text-muted transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <RotateCcw className="size-4" strokeWidth={2} aria-hidden="true" />
            {flipped ? t('ktm.showFront') : t('ktm.showBack')}
          </button>
        </div>
      )}
    </div>
  );
}

function Face({ side, hidden, children }: { side: Side; hidden: boolean; children: React.ReactNode }) {
  return (
    <div
      aria-hidden={hidden || undefined}
      className={cn(
        'absolute inset-0 overflow-hidden bg-band shadow-card [backface-visibility:hidden]',
        side === 'back' && '[transform:rotateY(180deg)] motion-reduce:[transform:none]',
        // Reduced motion: no 3D turn, the sides crossfade instead.
        'motion-reduce:transition-opacity motion-reduce:duration-300',
        hidden ? 'motion-reduce:opacity-0' : 'motion-reduce:opacity-100',
      )}
      style={{ borderRadius: `${ktm.radius * 100}cqw` }}
    >
      {children}
    </div>
  );
}

/**
 * One value under its printed label: heavy black caps at the card's size, shrunk to fit its width;
 * a value too long even at 60% wraps to two lines instead (never clipped).
 */
function Value({ label, value, y, maxW }: { label: string; value: string; y: number; maxW: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState<{ scale: number; wrap: boolean }>({ scale: 1, wrap: false });
  const text = value.trim().toLocaleUpperCase('id-ID');

  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    const measure = () => {
      // Natural one-line width at full size vs the space under the label (both scale with the card).
      // Measure at full size on one line, then restore what React rendered (it won't re-apply an unchanged style).
      const prev = { fontSize: el.style.fontSize, whiteSpace: el.style.whiteSpace };
      el.style.fontSize = `${VALUE_CQW}cqw`;
      el.style.whiteSpace = 'nowrap';
      const natural = el.scrollWidth;
      const room = box.clientWidth;
      el.style.fontSize = prev.fontSize;
      el.style.whiteSpace = prev.whiteSpace;
      if (!natural || !room) return;
      const ratio = room / natural;
      const next = ratio >= 0.6 ? { scale: Math.min(1, ratio), wrap: false } : { scale: Math.max(0.42, Math.min(0.6, ratio * 1.9)), wrap: true };
      setFit((f) => (f.scale === next.scale && f.wrap === next.wrap ? f : next));
    };
    measure();
    // Re-measure when a web font arrives: the card font only starts loading once a value is shown,
    // and the fallback face is wider.
    let alive = true;
    const onFonts = () => alive && measure();
    document.fonts?.ready.then(onFonts);
    document.fonts?.addEventListener('loadingdone', onFonts);
    return () => {
      alive = false;
      document.fonts?.removeEventListener('loadingdone', onFonts);
    };
  }, [text]);

  const style: CSSProperties = {
    left: pct(ktm.valueX),
    top: `calc(${pct(y)} - ${CAP_OFFSET_EM * VALUE_CQW * fit.scale}cqw)`,
    width: pct(maxW),
    color: brand.ink,
  };
  return (
    <div className="absolute" style={style}>
      <span className="sr-only">{label}: </span>
      <span
        ref={ref}
        className={cn('ktm-value block leading-none', fit.wrap ? 'whitespace-normal [overflow-wrap:anywhere]' : 'whitespace-nowrap')}
        style={{ fontSize: `${VALUE_CQW * fit.scale}cqw`, lineHeight: fit.wrap ? 1.04 : 1 }}
      >
        {text || ' '}
      </span>
    </div>
  );
}

/** White modules on the artwork's maroon tile, drawn as one SVG path (error correction M, no quiet zone: the tile is the zone). */
function Qr({ value, label }: { value: string; label: string }) {
  const path = useMemo(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const n = modules.size;
    let d = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) if (modules.get(y, x)) d += `M${x} ${y}h1v1h-1z`;
    }
    return { d, n };
  }, [value]);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${path.n} ${path.n}`}
      shapeRendering="crispEdges"
      className="absolute"
      style={{ left: pct(ktm.qr.x), top: pct(ktm.qr.y), width: pct(ktm.qr.w), aspectRatio: '1' }}
    >
      <path d={path.d} fill="#ffffff" />
    </svg>
  );
}
