"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, ClipboardCheck, FolderKanban, HardHat, Home, LogOut, MessageCircle, Mic, Package, Receipt, Settings, Users } from "lucide-react";

const ICONS = { home: Home, dashboard: BarChart3, leads: Users, projects: FolderKanban, inbox: MessageCircle, procurement: Package, expenses: Receipt, contractors: HardHat, snags: ClipboardCheck, voice: Mic, rates: BookOpen, admin: Settings };
/** Shown in the phone bottom bar; the rest are in the desktop sidebar only. */
const MOBILE: (keyof typeof ICONS)[] = ["home", "leads", "projects", "inbox", "voice"];
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number };

export function Sidebar({ items, userName, roleLabel, office, logout }: { items: NavItem[]; userName: string; roleLabel: string; office: string; logout: () => Promise<void> }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
      {/* Desktop */}
      <aside className="no-print fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-paper px-4 py-6 lg:flex">
        <Link href="/" className="h-display mb-8 px-2 text-2xl">
          Zukhti Home
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {items.map((it) => {
            const Icon = ICONS[it.icon];
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${active(it.href) ? "bg-ink text-paper" : "text-muted hover:bg-ivory hover:text-ink"}`}
              >
                <Icon size={18} />
                {it.label}
                {!!it.badge && <span className="ml-auto rounded-full bg-clay px-2 py-0.5 text-[11px] font-bold text-white">{it.badge}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line pt-4">
          <p className="px-2 text-sm font-semibold">{userName}</p>
          <p className="px-2 text-xs text-muted">
            {roleLabel} · {office}
          </p>
          <form action={logout}>
            <button className="mt-3 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm text-muted hover:bg-ivory hover:text-ink">
              <LogOut size={16} /> Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="no-print sticky top-0 z-20 flex items-center justify-between border-b border-line bg-paper/90 px-4 py-3 backdrop-blur lg:hidden">
        <Link href="/" className="h-display text-xl">
          Zukhti Home
        </Link>
        <form action={logout}>
          <button aria-label="Sign out" className="rounded-lg p-2 text-muted">
            <LogOut size={18} />
          </button>
        </form>
      </header>

      {/* Mobile bottom nav */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 grid border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] lg:hidden" style={{ gridTemplateColumns: `repeat(${items.filter((i) => MOBILE.includes(i.icon)).length}, minmax(0, 1fr))` }}>
        {items.filter((i) => MOBILE.includes(i.icon)).map((it) => {
          const Icon = ICONS[it.icon];
          const isVoice = it.icon === "voice";
          return (
            <Link key={it.href} href={it.href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${active(it.href) ? "text-ink" : "text-muted"}`}>
              <span className={`relative ${isVoice ? "grid h-9 w-9 place-items-center rounded-full bg-brass text-white" : ""}`}>
                <Icon size={isVoice ? 18 : 20} />
                {!!it.badge && <span className="absolute -right-2 -top-1 rounded-full bg-clay px-1.5 text-[10px] font-bold text-white">{it.badge}</span>}
              </span>
              {it.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
