import Link from "next/link";
import { LogOut } from "lucide-react";
import type { CurrentUser } from "@/lib/auth";
import { can, isDeskOnly, roleLabels } from "@/lib/permissions";
import { deskLogout } from "@/app/login/actions";

/** Shared header for the Voice Desk app; `wide` for table screens like procurement. */
export function DeskShell({ user, wide, active, children }: { user: CurrentUser; wide?: boolean; active: "updates" | "procurement" | "expenses" | "contractors" | "snags"; children: React.ReactNode }) {
  const width = wide ? "max-w-5xl" : "max-w-lg";
  const tabs = [
    { href: "/desk", label: "Updates", key: "updates" },
    ...(can(user.role, "expenses") ? [{ href: "/desk/expenses", label: "Expenses", key: "expenses" }] : []),
    ...(can(user.role, "contractors") ? [{ href: "/desk/contractors", label: "Contractors", key: "contractors" }] : []),
    ...(can(user.role, "snags") ? [{ href: "/desk/snags", label: "Snags", key: "snags" }] : []),
    ...(can(user.role, "orders") ? [{ href: "/desk/procurement", label: "Procurement", key: "procurement" }] : []),
  ];
  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <div className={`mx-auto flex ${width} items-center justify-between gap-3 px-4 py-3`}>
          <div className="min-w-0">
            <p className="h-display text-xl leading-tight">Voice Desk</p>
            <p className="truncate text-xs text-muted">
              {user.name} · {roleLabels[user.role]}
              {user.office ? ` · ${user.office.name}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!isDeskOnly(user.role) && (
              <Link href="/" className="btn-ghost px-3 py-1.5 text-xs">
                CRM
              </Link>
            )}
            <form action={deskLogout}>
              <button aria-label="Sign out" className="rounded-lg p-2 text-muted hover:text-ink">
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </div>
        {tabs.length > 1 && (
          <nav className={`mx-auto flex ${width} gap-1 overflow-x-auto px-4`}>
            {tabs.map((t) => (
              <Link key={t.key} href={t.href} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${active === t.key ? "border-ink text-ink" : "border-transparent text-muted"}`}>
                {t.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className={`mx-auto ${width} px-4 pb-16 pt-5 print:max-w-none print:p-0`}>{children}</main>
    </div>
  );
}
