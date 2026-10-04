"use server";

import Anthropic from "@anthropic-ai/sdk";
import { requireUser } from "@/lib/auth";
import { explainAiError } from "@/lib/ai-errors";

export type AiCheckResult = { ok: boolean; model: string; key: string; status?: number | null; type?: string | null; message?: string; hint?: string };

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
    return { ok: true, model, key: masked };
  } catch (e) {
    return { ok: false, model, key: masked, ...explainAiError(e) };
  }
}
