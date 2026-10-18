import { colors, toCssVariables } from '@pats/shared/tokens';
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { getLocale } from '@/lib/i18n';
import './globals.css';

// Self-hosted (no network at build): Figtree stands in for the card's Avenir in the UI; Graduate is
// the varsity slab of the card header, display lines only (DESIGN.md §4). Licences in ./fonts.
const figtree = localFont({ src: './fonts/Figtree-var.ttf', variable: '--font-figtree', weight: '300 900', display: 'swap' });
// The ONE card-value font for every platform (packages/shared/assets/fonts/README.md).
const cardValue = localFont({ src: '../../../../packages/shared/assets/fonts/card-value.ttf', variable: '--font-card', weight: '900', display: 'block' });
const graduate = localFont({ src: './fonts/Graduate-Regular.ttf', variable: '--font-graduate', weight: '400', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'https://patsuniv.znetworks.id'),
  title: { default: 'PATS University', template: '%s · PATS University' },
  applicationName: 'PATS University',
  // The official full crest (LOGO-01), resized and padded only (tools/brand/make-assets.sh).
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: { siteName: 'PATS University', images: [{ url: '/og.png', width: 1200, height: 630, alt: 'PATS University' }] },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: colors.light.bg },
    { media: '(prefers-color-scheme: dark)', color: colors.dark.bg },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${figtree.variable} ${graduate.variable} ${cardValue.variable}`} suppressHydrationWarning>
      <head>
        {/* Design tokens from packages/shared, as CSS variables (light + dark). */}
        <style dangerouslySetInnerHTML={{ __html: toCssVariables() }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
