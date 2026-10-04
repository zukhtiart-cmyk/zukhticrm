import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { DeskShell } from "../../desk-shell";

export const metadata: Metadata = { title: "Site expenses", robots: { index: false } };

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("expenses");
  return (
    <DeskShell user={user} wide active="expenses">
      {children}
    </DeskShell>
  );
}
