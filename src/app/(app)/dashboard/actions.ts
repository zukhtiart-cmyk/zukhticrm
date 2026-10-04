"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { buildDailyReport, sendDailyReport } from "@/lib/daily-report";

export async function generateDailyReport(form: FormData) {
  await requireUser("admin");
  const report = await buildDailyReport();
  if (form.get("send") === "1") await sendDailyReport(report.body);
  revalidatePath("/dashboard");
}
