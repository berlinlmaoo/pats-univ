import { size } from '@pats/shared/tokens';
import { cn } from '@/lib/cn';

/**
 * Official marks only (Berlin's Vault, LOGO > PATS UNIV), resized by tools/brand/make-assets.sh.
 * Never cropped, masked, recoloured or redrawn: the full crest is the logo at every size.
 */
const CREST_WIDTHS = [64, 80, 120, 160, 240, 320, 480];
const LOCKUP_WIDTHS = [240, 480, 720];

/** The full PATS University crest (LOGO-01), used wherever the brand name would go. */
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

/**
 * The arched "PATS / UNIVERSITY" ribbon lockup from the card back: cream (LOGO-07) on the navy
 * band, navy (LOGO-09) on paper. Decorative when the crest already names the page.
 */
export function BrandLockup({ tone, width, className, decorative }: { tone: 'cream' | 'navy'; width: number; className?: string; decorative?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static, pre-sized brand art
    <img
      src={`/brand/lockup-${tone}-240.png`}
      srcSet={LOCKUP_WIDTHS.map((w) => `/brand/lockup-${tone}-${w}.png ${w}w`).join(', ')}
      sizes={`${width}px`}
      width={width}
      alt={decorative ? '' : 'PATS University'}
      draggable={false}
      className={cn('h-auto shrink-0 select-none', className)}
    />
  );
}
