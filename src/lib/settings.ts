import "server-only";
import { eq } from "drizzle-orm";
import { db, settings } from "@/db";

/** 1 unit of each currency = this many INR. Edited by the owner on the Rates page. */
export type FxRates = { asOf: string; perINR: Record<string, number> };

export type AppSettings = {
  fxRates: FxRates;
  /** auto = assistant replies straight away; approve = replies wait in the inbox for a person to send */
  whatsappMode: "auto" | "approve";
  /** Saturday summary to every client with an active project */
  weeklySummary: boolean;
  /** Evening operations summary to owners/admins on WhatsApp */
  dailySummary: boolean;
};

const DEFAULTS: AppSettings = {
  whatsappMode: "approve",
  weeklySummary: true,
  dailySummary: true,
  // Starting values only — check and update them on the Rates page.
  fxRates: { asOf: "not set", perINR: { INR: 1, AED: 23, CNY: 12, USD: 85, EUR: 92 } },
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.select().from(settings);
  const out: Record<string, unknown> = { ...DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  return out as AppSettings;
}

export async function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

export async function getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, key) });
  return (row?.value as AppSettings[K]) ?? DEFAULTS[key];
}
