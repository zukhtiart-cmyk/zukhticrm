import { NextResponse } from "next/server";
import { buildDailyReport, sendAmcReminders, sendDailyReport } from "@/lib/daily-report";
import { getSettings } from "@/lib/settings";

export const maxDuration = 120;

/** Evening site summary (Vercel Cron 13:30 UTC = 7 pm IST). Protected by CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const appUrl = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const amc = await sendAmcReminders(appUrl);
  const report = await buildDailyReport();
  const { dailySummary } = await getSettings();
  const sent = dailySummary ? await sendDailyReport(report.body) : [];
  return NextResponse.json({ day: report.day, ai: report.ai, sent, amc });
}
