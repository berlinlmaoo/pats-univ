'use client';

import {
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Download,
  Gift,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Settings2,
  ShieldCheck,
  Trophy,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { LanguageSwitch } from '@/components/i18n/language-switch';
import { useT } from '@/components/i18n/provider';
import { Spinner } from '@/components/ui/spinner';
import { Wordmark } from '@/components/ui/wordmark';
import type { MessageKey } from '@pats/shared';
import { cn } from '@/lib/cn';

type NavItem = { href: string; labelKey: MessageKey; icon: LucideIcon };

/** Grouped navigation, one icon per destination (PRODUCT.md §5.3 page order; Overview first for HQ). */
const NAV: { groupKey: MessageKey; items: NavItem[] }[] = [
  {
    groupKey: 'nav.groupOperations',
    items: [
      { href: '/overview', labelKey: 'nav.overview', icon: LayoutDashboard },
      { href: '/regional', labelKey: 'phase5.operations', icon: ClipboardList },
      { href: '/events', labelKey: 'nav.events', icon: CalendarDays },
      { href: '/recaps', labelKey: 'loyalty.recap', icon: BarChart3 },
    ],
  },
  {
    groupKey: 'nav.groupMembers',
    items: [
      { href: '/members', labelKey: 'nav.members', icon: Users },
      { href: '/cards', labelKey: 'nav.cards', icon: CreditCard },
    ],
  },
  {
    groupKey: 'nav.groupLoyalty',
    items: [
      { href: '/rewards', labelKey: 'loyalty.title', icon: Gift },
      { href: '/leaderboard', labelKey: 'loyalty.leaderboard', icon: Trophy },
    ],
  },
  { groupKey: 'nav.groupCommunity', items: [{ href: '/hub', labelKey: 'social.title', icon: MessagesSquare }] },
  {
    groupKey: 'nav.groupSystem',
    items: [
      { href: '/cities', labelKey: 'nav.cities', icon: Building2 },
      { href: '/admins', labelKey: 'nav.admins', icon: ShieldCheck },
      { href: '/exports', labelKey: 'loyalty.export', icon: Download },
      { href: '/settings', labelKey: 'nav.settings', icon: Settings2 },
    ],
  },
];

/** Routes a Regional Admin can open (the rest are HQ-only and redirect). */
export const REGIONAL_ROUTES = ['/regional', '/events', '/rewards', '/recaps', '/hub'];

export function Shell({
  user,
  demo,
  badges = {},
  children,
}: {
  user: { name: string; email: string; regional?: boolean; /** City name for a Regional Admin. */ scope?: string };
  demo: boolean;
  /** Counts that need HQ's attention, by nav href (e.g. pending re-encode requests on /cards). */
  badges?: Record<string, number>;
  children: ReactNode;
}) {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const groups = NAV.map((g) => ({
    ...g,
    // Regional admins: their city's operations first; HQ: the overview first.
    items: g.items.filter((item) => (user.regional ? REGIONAL_ROUTES.includes(item.href) : true)),
  })).filter((g) => g.items.length > 0);
  if (user.regional) groups[0]!.items.sort((x, y) => (x.href === '/regional' ? -1 : y.href === '/regional' ? 1 : 0));

  // The sidebar is the card's navy header band, in both schemes: crest, gold rule, cream type.
  const sidebar = (inDrawer: boolean) => (
    <div className="flex h-full flex-col bg-band text-band-fg">
      <div className="gold-rule flex items-center justify-between gap-3 px-4 pb-4 pt-4">
        <Link href={user.regional ? '/regional' : '/overview'} className="flex min-w-0 items-center gap-3 rounded-control" onClick={() => setOpen(false)}>
          <Wordmark px={48} />
          <span className="min-w-0">
            <span className="ktm-label block text-band-fg">{t('nav.dashboardLabel')}</span>
            <span className="block truncate text-caption text-band-muted">{user.regional ? user.scope ?? t('role.REGIONAL_ADMIN') : t('role.SUPER_ADMIN')}</span>
          </span>
        </Link>
        {inDrawer ? (
          <button
            type="button"
            className="-mr-1 inline-flex size-control-sm items-center justify-center rounded-control text-band-muted hover:bg-white/10 hover:text-band-fg"
            aria-label={t('common.close')}
            onClick={() => setOpen(false)}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-3 pt-4 [scrollbar-color:rgba(255,255,255,0.2)_transparent]" aria-label={t('nav.dashboardLabel')}>
        {groups.map((group) => (
          <div key={group.groupKey} className="mb-4 last:mb-0">
            <p className="ktm-label px-2.5 pb-1.5 text-band-muted/80">{t(group.groupKey)}</p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map(({ href, labelKey, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex h-9 items-center gap-2.5 rounded-sm px-2.5 text-body-sm transition-colors',
                        active ? 'bg-white/10 font-bold text-band-fg' : 'font-medium text-band-muted hover:bg-white/5 hover:text-band-fg',
                      )}
                    >
                      <Icon className={cn('size-4 shrink-0', active && 'text-gold')} strokeWidth={1.75} aria-hidden="true" />
                      <span className="truncate">{t(labelKey)}</span>
                      {badges[href] ? (
                        <span
                          className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-secondary px-1 text-[11px] font-black tabular-nums text-secondary-fg"
                          aria-label={t('nav.needsAttention', { count: badges[href] })}
                        >
                          {badges[href]}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        {demo && (
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-sm bg-gold px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.05em] text-band">{t('common.demoMode')}</p>
        )}
        <div className="flex items-center gap-2.5 px-1">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-band-fg text-caption font-black text-band">{initials(user.name)}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-sm font-bold text-band-fg">{user.name}</p>
            <p className="truncate text-caption text-band-muted">{user.email}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <LanguageSwitch onBand />
          <SignOutButton />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-sidebar">
      <aside className="fixed inset-y-0 left-0 hidden w-sidebar lg:block">{sidebar(false)}</aside>

      <div className="gold-rule sticky top-0 z-20 flex h-14 items-center justify-between bg-band px-4 text-band-fg lg:hidden">
        <Link href={user.regional ? '/regional' : '/overview'} className="flex items-center gap-2.5">
          <Wordmark px={36} />
          <span className="ktm-label text-band-fg">{t('nav.dashboardLabel')}</span>
        </Link>
        <button
          type="button"
          className="-mr-2 inline-flex size-control-md items-center justify-center rounded-control text-band-fg hover:bg-white/10"
          aria-label={t('common.menu')}
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button type="button" aria-label={t('common.close')} className="absolute inset-0 bg-scrim" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[min(18rem,85vw)] animate-fade-up shadow-pop">
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
    <button
      type="button"
      disabled={busy}
      aria-busy={busy || undefined}
      className="inline-flex h-control-sm items-center gap-1.5 rounded-control px-2.5 text-body-sm font-bold text-band-muted transition-colors hover:bg-white/10 hover:text-band-fg disabled:opacity-60"
      onClick={async () => {
        setBusy(true);
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
        router.replace('/login');
        router.refresh();
      }}
    >
      {busy ? <Spinner /> : <LogOut className="size-4" aria-hidden="true" />}
      {t('common.signOut')}
    </button>
  );
}
