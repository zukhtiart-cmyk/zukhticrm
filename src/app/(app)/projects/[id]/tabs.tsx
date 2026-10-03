"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ProjectTabs({ id, tabs }: { id: string; tabs: { slug: string; label: string }[] }) {
  const path = usePathname();
  return (
    <div className="no-print -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      {tabs.map((t) => {
        const href = `/projects/${id}${t.slug ? `/${t.slug}` : ""}`;
        const active = t.slug ? path.startsWith(href) : path === href;
        return (
          <Link key={t.slug} href={href} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold ${active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
