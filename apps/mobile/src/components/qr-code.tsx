import QRCode from 'qrcode';
import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

/** Quiet zone in modules, per the QR spec. */
const QUIET = 4;

/**
 * A QR drawn as one SVG path. Always dark modules on white, in both themes: scanners need the
 * contrast, so the colours are passed in from the light palette, not the current scheme.
 */
export function QrCode({ value, size, color, background }: { value: string; size: number; color: string; background: string }) {
  const { path, count } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    let d = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.modules.get(y, x)) d += `M${x + QUIET} ${y + QUIET}h1v1h-1z`;
      }
    }
    return { path: d, count: n + QUIET * 2 };
  }, [value]);

  // Whole points per module (rounded to the nearest fit), so modules meet without anti-aliased seams.
  const side = Math.max(1, Math.round(size / count)) * count;
  return (
    <Svg width={side} height={side} viewBox={`0 0 ${count} ${count}`}>
      <Rect width={count} height={count} fill={background} />
      <Path d={path} fill={color} />
    </Svg>
  );
}
