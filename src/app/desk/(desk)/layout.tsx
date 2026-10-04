import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { isDeskOnly, roleLabels } from "@/lib/permissions";
import { deskLogout } from "@/app/login/actions";

export const metadata: Metadata = { title: "Voice Desk", robots: { index: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, themeColor: "#f7f4ee" };

export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("voice");
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-3">
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
      </header>
      <main className="mx-auto max-w-lg px-4 pb-16 pt-5">{children}</main>
    </div>
  );
}
