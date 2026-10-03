import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your project · Zukhti Home",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="no-print border-b border-line bg-paper">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <p className="h-display text-2xl">Zukhti Home</p>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Client portal</p>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-6 print:max-w-none print:p-0">{children}</main>
    </div>
  );
}
