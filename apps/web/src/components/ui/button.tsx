import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'maroon';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-control font-bold ' +
  'transition-[background-color,border-color,color,transform,opacity,box-shadow] active:scale-[0.98] ' +
  // Disabled reads as disabled in both schemes: no fill, dashed edge, muted text (never a pale "active" look).
  'disabled:pointer-events-none disabled:border disabled:border-dashed disabled:border-border-strong/70 disabled:bg-transparent disabled:text-muted disabled:shadow-none ' +
  'aria-disabled:pointer-events-none aria-disabled:opacity-50';

const variants: Record<Variant, string> = {
  // Navy with cream lettering in light (the card header), cream with navy in dark (the card back).
  primary: 'bg-primary text-primary-fg shadow-soft hover:shadow-[inset_0_-3px_0_var(--pats-gold)]',
  secondary: 'border border-border-strong/60 bg-surface text-fg hover:border-border-strong hover:bg-surface-hover',
  ghost: 'text-muted hover:bg-surface-hover hover:text-fg',
  danger: 'bg-danger-solid text-on-solid hover:opacity-90',
  // The QR tile maroon: reserved for the one KTM-related action on a screen (show card, check in).
  maroon: 'bg-secondary text-secondary-fg shadow-soft hover:shadow-[inset_0_-3px_0_var(--pats-gold)]',
};

const sizes: Record<Size, string> = {
  sm: 'h-control-sm px-3 text-body-sm [&_svg]:size-4',
  md: 'h-control-md px-4 text-body-sm [&_svg]:size-4',
  lg: 'h-control-lg px-5 text-body [&_svg]:size-4.5',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant,
  size,
  loading,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ComponentProps<'button'> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
