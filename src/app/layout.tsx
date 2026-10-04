import { UpdateBanner } from "@/components/update-banner";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Zukhti Home CRM", template: "%s · Zukhti Home" },
  description: "Leads, projects, quotes, payments and site updates for Zukhti Home",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f7f4ee" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <UpdateBanner version={process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "dev"} />
        {children}
      </body>
    </html>
  );
}
