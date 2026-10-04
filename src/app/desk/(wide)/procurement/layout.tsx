import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { DeskShell } from "../../desk-shell";

export const metadata: Metadata = { title: "Procurement", robots: { index: false } };

export default async function ProcurementLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("orders");
  return (
    <DeskShell user={user} wide active="procurement">
      {children}
    </DeskShell>
  );
}
