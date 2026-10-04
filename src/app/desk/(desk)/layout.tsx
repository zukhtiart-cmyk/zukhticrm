import type { Metadata, Viewport } from "next";
import { requireUser } from "@/lib/auth";
import { DeskShell } from "../desk-shell";
import { SwRegister } from "@/components/sw";

export const metadata: Metadata = { title: "Voice Desk", robots: { index: false }, manifest: "/manifest.webmanifest" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, themeColor: "#f7f4ee" };

export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("voice");
  return (
    <DeskShell user={user} active="updates">
      <SwRegister />
      {children}
    </DeskShell>
  );
}
