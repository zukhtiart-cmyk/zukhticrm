import { NextResponse } from "next/server";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db, projects, siteUpdates, waMessages, conversations } from "@/db";
import { getSettings } from "@/lib/settings";
import { projectFacts, statusMessage } from "@/lib/wa-facts";
import { notifyClient } from "@/lib/wa-conversations";
import { normalizePhone } from "@/lib/whatsapp";

export const maxDuration = 300;

/**
 * Saturday weekly summary (Vercel Cron, see vercel.json).
 * Sends each client with an ACTIVE project a short status update, once per week.
 * Protected by CRON_SECRET (Vercel sends it as a Bearer token).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const settings = await getSettings();
  if (!settings.weeklySummary) return NextResponse.json({ skipped: "weekly summaries are turned off" });

  const appUrl = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const weekAgo = new Date(Date.now() - 6 * 86400000);
  const active = await db.query.projects.findMany({ where: eq(projects.status, "ACTIVE"), with: { client: true } });
  const results: { project: string; status: string }[] = [];

  for (const p of active) {
    // Don't double up if the client already got a summary this week.
    const conv = await db.query.conversations.findFirst({ where: eq(conversations.phone, normalizePhone(p.client.phone)) });
    if (conv) {
      const recent = await db.query.waMessages.findFirst({
        where: and(eq(waMessages.conversationId, conv.id), eq(waMessages.intent, `weekly:${p.id}`), gte(waMessages.createdAt, weekAgo), inArray(waMessages.status, ["SENT", "AUTO_REPLIED"])),
      });
      if (recent) {
        results.push({ project: p.name, status: "already sent this week" });
        continue;
      }
    }
    const facts = await projectFacts(p.id, appUrl);
    if (!facts) continue;
    const thisWeek = await db.query.siteUpdates.findMany({ where: and(eq(siteUpdates.projectId, p.id), gte(siteUpdates.createdAt, weekAgo)) });
    const text = `*Weekly update* — ${thisWeek.length} site update${thisWeek.length === 1 ? "" : "s"} this week.\n\n${statusMessage(facts)}`;
    const res = await notifyClient(p.client, text, [], appUrl);
    // Tag the logged message so we don't resend this week.
    const c = await db.query.conversations.findFirst({ where: eq(conversations.phone, normalizePhone(p.client.phone)) });
    if (c) {
      const last = await db.query.waMessages.findFirst({ where: and(eq(waMessages.conversationId, c.id), eq(waMessages.direction, "OUT")), orderBy: (m, { desc }) => desc(m.createdAt) });
      if (last) await db.update(waMessages).set({ intent: `weekly:${p.id}` }).where(eq(waMessages.id, last.id));
    }
    results.push({ project: p.name, status: res.note });
  }
  return NextResponse.json({ sent: results.length, results });
}
