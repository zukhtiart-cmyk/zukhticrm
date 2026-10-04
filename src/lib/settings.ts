import "server-only";
import { eq } from "drizzle-orm";
import { db, settings } from "@/db";

export type AppSettings = {
  /** auto = assistant replies straight away; approve = replies wait in the inbox for a person to send */
  whatsappMode: "auto" | "approve";
  /** Saturday summary to every client with an active project */
  weeklySummary: boolean;
};

const DEFAULTS: AppSettings = { whatsappMode: "approve", weeklySummary: true };

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
