"use server";

import { asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { boqItems, db, rateItems } from "@/db";
import { draftBoq, type BoqSuggestion } from "@/lib/ai-boq";
import { syncMilestoneAmounts } from "@/lib/projects";
import { assertProjectAccess } from "./data";

export type DraftState = { error?: string; items?: BoqSuggestion[]; assumptions?: string[]; at?: number };

const MAX = 10 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** Asks the AI for a draft BOQ. Nothing is saved — the designer picks lines in the preview. */
export async function draftBoqAction(_: DraftState, form: FormData): Promise<DraftState> {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "boq");
  const brief = String(form.get("brief") ?? "").trim();
  const file = form.get("plan");
  const hasFile = file instanceof File && file.size > 0;
  if (brief.length < 10 && !hasFile) return { error: "Describe the scope (rooms, sizes, style) or attach a floor plan." };
  if (hasFile && file.size > MAX) return { error: "The floor plan must be under 10 MB." };
  if (hasFile && !TYPES.includes(file.type)) return { error: "Attach a JPG, PNG, WebP or PDF." };
  const rates = await db.select().from(rateItems).orderBy(asc(rateItems.category), asc(rateItems.name));
  try {
    const out = await draftBoq({
      brief: brief || "See the attached floor plan.",
      file: hasFile ? { data: Buffer.from(await file.arrayBuffer()).toString("base64"), mediaType: file.type } : null,
      rates: rates.map((r) => ({ id: r.id, category: r.category, name: r.name, unit: r.unit, price: r.price, currency: r.currency })),
      currency: project.office.currency,
      propertyHint: project.siteAddress || undefined,
    });
    if (!out.items.length) return { error: "The AI couldn't draft any lines. Add more detail (room list, sizes)." };
    return { ...out, at: Date.now() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/credit|billing|429|quota/i.test(msg)) return { error: "The AI provider declined the request (check Anthropic credit/billing). Add lines manually below meanwhile." };
    return { error: msg.includes("ANTHROPIC_API_KEY") ? msg : `AI draft failed: ${msg.slice(0, 200)}` };
  }
}

const lineSchema = z.object({
  room: z.string().trim().min(1).max(80),
  rateItemId: z.string().nullable(),
  description: z.string().trim().min(1).max(300),
  unit: z.string().trim().max(20),
  qty: z.number().positive().max(1e6),
});

/** Adds the lines the designer kept. Prices come from the rate library (0 for custom lines). */
export async function addDraftLines(projectId: string, lines: unknown): Promise<{ error?: string; added?: number }> {
  const { project } = await assertProjectAccess(projectId, "boq");
  const parsed = z.array(lineSchema).max(200).safeParse(lines);
  if (!parsed.success || !parsed.data.length) return { error: "Nothing selected." };
  const rates = await db.select().from(rateItems);
  const byId = new Map(rates.map((r) => [r.id, r]));
  await db.insert(boqItems).values(
    parsed.data.map((l) => {
      const rate = l.rateItemId ? byId.get(l.rateItemId) : undefined;
      return {
        projectId: project.id,
        room: l.room,
        description: l.description,
        unit: l.unit || rate?.unit || "nos",
        qty: l.qty,
        unitCost: rate?.cost ?? 0,
        unitPrice: rate?.price ?? 0,
        rateItemId: rate?.id ?? null,
      };
    }),
  );
  await syncMilestoneAmounts(db, project.id, project.office.taxRate);
  revalidatePath(`/projects/${project.id}`, "layout");
  return { added: parsed.data.length };
}
