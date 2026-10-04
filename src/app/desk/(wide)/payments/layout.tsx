import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { DeskShell } from "../../desk-shell";

export const metadata: Metadata = { title: "Payments", robots: { index: false } };

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("payouts");
  return (
    <DeskShell user={user} wide active="payments">
      {children}
    </DeskShell>
  );
}
