'use client';

import { Building2, LayoutGrid, LogOut, Menu, Settings2, ShieldCheck, Users, X, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { LanguageSwitch } from '@/components/i18n/language-switch';
import { useT } from '@/components/i18n/provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/ui/wordmark';
import type { MessageKey } from '@pats/shared';
import { cn } from '@/lib/cn';

/** Pages built so far. Cards, Events and the later pages join this list as they ship. */
const NAV: { href: string; labelKey: MessageKey; icon: LucideIcon }[] = [
  { href: '/overview', labelKey: 'nav.overview', icon: LayoutGrid },
  { href: '/members', labelKey: 'nav.members', icon: Users },
  { href: '/cities', labelKey: 'nav.cities', icon: Building2 },
  { href: '/admins', labelKey: 'nav.admins', icon: ShieldCheck },
  { href: '/settings', labelKey: 'nav.settings', icon: Settings2 },
];

export function Shell({ user, demo, children }: { user: { name: string; email: string }; demo: boolean; children: ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const sidebar = (inDrawer: boolean) => (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between gap-2 px-4">
        <Wordmark />
        {inDrawer ? (
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2 w-control-sm px-0"
            aria-label={t('common.close')}
            onClick={() => setOpen(false)}
          >
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="HQ">
        <ul className="flex flex-col gap-0.5">
          {NAV.map(({ href, labelKey, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-9 items-center gap-2.5 rounded-sm px-2.5 text-body-sm font-medium transition-colors',
                    active ? 'bg-surface-muted text-fg' : 'text-muted hover:bg-surface-hover hover:text-fg',
                  )}
                >
                  <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  <span className="truncate">{t(labelKey)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-border p-3">
        {demo && (
          <div className="mb-3 px-1">
            <Badge tone="accent" dot>
              {t('common.demoMode')}
            </Badge>
          </div>
        )}
        <div className="flex items-center gap-2.5 px-1">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-caption font-semibold text-accent-subtle-fg">
            {initials(user.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-sm font-medium text-fg">{user.name}</p>
            <p className="truncate text-caption text-muted">{user.email}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <LanguageSwitch />
          <SignOutButton />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-sidebar">
      <aside className="fixed inset-y-0 left-0 hidden w-sidebar border-r border-border bg-surface lg:block">{sidebar(false)}</aside>

      <div className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-surface/90 px-4 backdrop-blur lg:hidden">
        <Wordmark />
        <Button variant="ghost" size="sm" className="-mr-2 w-control-sm px-0" aria-label={t('common.menu')} aria-expanded={open} onClick={() => setOpen(true)}>
          <Menu aria-hidden="true" />
        </Button>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button type="button" aria-label={t('common.close')} className="absolute inset-0 bg-scrim" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[min(18rem,85vw)] animate-fade-up border-r border-border bg-surface shadow-pop">
            {sidebar(true)}
          </div>
        </div>
      )}

      <main className="mx-auto w-full min-w-0 max-w-content px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-10">{children}</main>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

function SignOutButton() {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
        router.replace('/login');
        router.refresh();
      }}
    >
      {!busy && <LogOut aria-hidden="true" />}
      {t('common.signOut')}
    </Button>
  );
}
