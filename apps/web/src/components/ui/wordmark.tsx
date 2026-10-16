import { size } from '@pats/shared/tokens';
import { cn } from '@/lib/cn';

/** Pre-sized crest files in public/brand (tools/brand/make-assets.sh), so it stays crisp at 1x–3x. */
const CREST_WIDTHS = [80, 120, 160, 240];

/** The PATS crest, used wherever the brand name would go. */
export function Wordmark({ className, px = size.crest }: { className?: string; px?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static, pre-sized brand art; nothing for the optimiser to do
    <img
      src="/brand/crest-80.png"
      srcSet={CREST_WIDTHS.map((w) => `/brand/crest-${w}.png ${w}w`).join(', ')}
      sizes={`${px}px`}
      width={px}
      height={px}
      alt="PATS University"
      draggable={false}
      className={cn('shrink-0 select-none', className)}
    />
  );
}
