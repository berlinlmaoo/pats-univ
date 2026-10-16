import { colors, toCssVariables } from '@pats/shared/tokens';
import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { getLocale } from '@/lib/i18n';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  weight: ['600', '700', '800'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'PATS University', template: '%s · PATS University' },
  applicationName: 'PATS University',
  // The shield from the crest (tools/brand/make-assets.sh); the full crest blurs at these sizes.
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
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
    <html lang={locale} className={`${inter.variable} ${jakarta.variable}`} suppressHydrationWarning>
      <head>
        {/* Design tokens from packages/shared, as CSS variables (light + dark). */}
        <style dangerouslySetInnerHTML={{ __html: toCssVariables() }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
