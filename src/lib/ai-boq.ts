import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { callTool } from "./ai-call";

export type RateOption = { id: string; category: string; name: string; unit: string; price: number; currency: string };
export type BoqSuggestion = { room: string; rateItemId: string | null; description: string; unit: string; qty: number; note?: string };

const TOOL = {
  name: "draft_boq",
  description: "Draft a bill of quantities for an interior fit-out.",
  input_schema: {
    type: "object" as const,
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            room: { type: "string" },
            rate_item_id: { type: ["string", "null"], description: "Id from the rate library when an item matches; null for a custom item." },
            description: { type: "string" },
            unit: { type: "string", description: "Use the rate library unit when matched (sqft, rft, nos, point…)." },
            qty: { type: "number" },
            note: { type: "string", description: "How the quantity was estimated, briefly." },
          },
          required: ["room", "rate_item_id", "description", "unit", "qty"],
        },
      },
      assumptions: { type: "array", items: { type: "string" }, description: "Key assumptions the designer must check (sizes, scope)." },
    },
    required: ["items", "assumptions"],
  },
};

/**
 * Drafts a room-by-room BOQ from a brief and optionally a floor plan (image or PDF),
 * using the company rate library. The designer reviews every line before it's added.
 */
export async function draftBoq(input: { brief: string; file?: { data: string; mediaType: string } | null; rates: RateOption[]; currency: string; propertyHint?: string }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("AI drafting needs ANTHROPIC_API_KEY in Vercel.");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const content: Anthropic.Messages.ContentBlockParam[] = [];
  if (input.file) {
    if (input.file.mediaType === "application/pdf") {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: input.file.data } });
    } else {
      content.push({ type: "image", source: { type: "base64", media_type: input.file.mediaType as "image/jpeg" | "image/png" | "image/webp", data: input.file.data } });
    }
  }
  content.push({
    type: "text",
    text: `Client brief:\n"""${input.brief}"""\n${input.propertyHint ? `Property: ${input.propertyHint}\n` : ""}${input.file ? "A floor plan or reference is attached; read room names and dimensions from it where visible.\n" : ""}Draft the BOQ now.`,
  });

  type Out = { items?: { room: string; rate_item_id: string | null; description: string; unit: string; qty: number; note?: string }[]; assumptions?: string[] };
  const out = await callTool<Out>(client, {
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    max_tokens: 4000,
    system: `You are a senior estimator at Zukhti Home, a turnkey interior design company (India, UAE). Draft a practical room-by-room bill of quantities.
Rules:
- Prefer items from the rate library below; use their exact id, name and unit. Only add custom items (rate_item_id null) when nothing fits.
- Estimate realistic quantities from the brief and plan (e.g. false ceiling ≈ carpet area, paint ≈ 3× floor area for walls+ceiling, wardrobe sqft = width × height, kitchen in running feet). State the basis in "note".
- Don't invent rooms or scope the client didn't ask for; list uncertainties in "assumptions".
- Quantities are numbers only. Currency is ${input.currency}; do not add prices (they come from the rate library).
Rate library:
${input.rates.map((r) => `${r.id} | ${r.category} | ${r.name} | ${r.unit}`).join("\n") || "(empty)"}`,
    tools: [TOOL],
    messages: [{ role: "user", content }],
  }, TOOL.name);
  const ids = new Set(input.rates.map((r) => r.id));
  const items: BoqSuggestion[] = (out.items ?? [])
    .filter((i) => i.room && i.description && Number(i.qty) > 0)
    .map((i) => {
      const rate = i.rate_item_id && ids.has(i.rate_item_id) ? input.rates.find((r) => r.id === i.rate_item_id)! : null;
      return { room: i.room.trim(), rateItemId: rate?.id ?? null, description: rate?.name ?? i.description.trim(), unit: rate?.unit ?? i.unit, qty: Math.round(Number(i.qty) * 100) / 100, note: i.note };
    });
  return { items, assumptions: (out.assumptions ?? []).filter(Boolean) };
}
