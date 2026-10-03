import Link from "next/link";
import { titleCase } from "@/lib/format";

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {back && (
          <Link href={back.href} className="mb-1 inline-block text-xs font-semibold text-muted hover:text-ink">
            ← {back.label}
          </Link>
        )}
        <h1 className="h-display text-3xl sm:text-4xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const tones: Record<string, string> = {
  neutral: "bg-ivory text-muted border-line",
  brass: "bg-brass-soft text-brass border-brass/20",
  olive: "bg-olive-soft text-olive border-olive/20",
  clay: "bg-clay-soft text-clay border-clay/20",
  sky: "bg-sky-soft text-sky border-sky/20",
};

const statusTone: Record<string, keyof typeof tones> = {
  NEW: "sky",
  CONTACTED: "sky",
  SITE_VISIT: "brass",
  DESIGN: "brass",
  QUOTED: "brass",
  WON: "olive",
  LOST: "neutral",
  ACTIVE: "olive",
  ON_HOLD: "clay",
  HANDED_OVER: "neutral",
  NOT_STARTED: "neutral",
  IN_PROGRESS: "brass",
  DONE: "olive",
  PENDING: "neutral",
  INVOICED: "brass",
  PAID: "olive",
  ORDERED: "neutral",
  IN_PRODUCTION: "brass",
  SHIPPED: "sky",
  CUSTOMS: "clay",
  DELIVERED: "olive",
  DRAFT: "neutral",
  SENT: "sky",
  ACCEPTED: "olive",
};

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: keyof typeof tones }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone[status] ?? "neutral"}>{titleCase(status)}</Badge>;
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="h-display mt-1 text-3xl">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Section({ title, actions, children, className = "" }: { title: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</p>;
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-line/70">
      <div className="h-full rounded-full bg-olive transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
