"use server";

import Anthropic from "@anthropic-ai/sdk";
import { requireUser } from "@/lib/auth";
import { explainAiError } from "@/lib/ai-errors";
import { aiExtract } from "@/lib/intake";
import { db, offices } from "@/db";

export type AiCheckResult = { ok: boolean; model: string; key: string; sample?: string; status?: number | null; type?: string | null; message?: string; hint?: string };

/** Makes a tiny Claude request and reports exactly what Anthropic answers. */
export async function testAiConnection(): Promise<AiCheckResult> {
  await requireUser("admin");
  const key = process.env.ANTHROPIC_API_KEY ?? "";
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
  const masked = key ? `${key.slice(0, 10)}…${key.slice(-4)}` : "none set";
  if (!key) return { ok: false, model, key: masked, message: "ANTHROPIC_API_KEY is not set in Vercel.", hint: "Add it under Vercel → Settings → Environment Variables, then redeploy." };
  try {
    const client = new Anthropic({ apiKey: key });
    await client.messages.create({ model, max_tokens: 5, messages: [{ role: "user", content: "Reply OK" }] });
    // Also run the real voice-lead request, so tool use is tested end to end.
    const officeRows = await db.select().from(offices);
    const f = await aiExtract(
      "lead",
      "New lead Rohit Malhotra, 98210 98441, 3 bedroom apartment in Andheri, came through Instagram, budget 60 lakh",
      {},
      null,
      { today: new Date().toISOString().slice(0, 10), offices: officeRows.map((o) => ({ id: o.id, name: o.name, city: o.city, currency: o.currency })), defaultOfficeId: null, speaker: "Test" },
    );
    const got = ["name", "phone", "city", "propertyType", "source", "budgetBand"].filter((k) => f[k]);
    return { ok: got.length >= 4, model, key: masked, sample: `Voice lead test understood: ${got.map((k) => `${k} = ${f[k]}`).join(", ")}`, ...(got.length >= 4 ? {} : { message: "Claude answered but understood too little of the test sentence." }) };
  } catch (e) {
    return { ok: false, model, key: masked, ...explainAiError(e) };
  }
}
