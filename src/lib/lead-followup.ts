import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { desc, eq } from "drizzle-orm";
import { conversations, db, waMessages } from "@/db";
import { normalizePhone } from "./whatsapp";

type LeadLike = { name: string; phone: string; status: string; city: string | null; propertyType: string | null; budgetBand: string | null; notes: string | null; source: string };
type Activity = { type: string; summary: string; at: Date };

/** Template follow-up by pipeline stage — used when no AI key is set or the AI fails. */
export function templateFollowUp(lead: LeadLike, senderName: string) {
  const first = lead.name.split(" ")[0];
  const prop = lead.propertyType ? ` ${lead.propertyType.toLowerCase()}` : "";
  const me = senderName.split(" ")[0];
  switch (lead.status) {
    case "NEW":
      return `Hi ${first}, this is ${me} from Zukhti Home. Thanks for reaching out about your${prop} interiors! Could we set up a quick 15-minute call this week to understand what you have in mind? Let me know a time that suits you.`;
    case "CONTACTED":
      return `Hi ${first}, ${me} from Zukhti Home here. Following up on our chat — would you like us to visit the site and take measurements? We can share a rough budget and timeline after the visit. Which day works for you?`;
    case "SITE_VISIT":
      return `Hi ${first}, thanks again for showing us the site. Our design team is working on the layout and concept. Shall we fix a time to walk you through it?`;
    case "DESIGN":
      return `Hi ${first}, just checking in on the design concept we shared. Any changes you'd like before we prepare the detailed quotation?`;
    case "QUOTED":
      return `Hi ${first}, hope you had a chance to go through the quotation. Happy to walk you through any line item or adjust the scope to suit your budget. When would be a good time to talk?`;
    default:
      return `Hi ${first}, ${me} from Zukhti Home. Just checking in — let me know if there's anything we can help with.`;
  }
}

export async function draftFollowUp(lead: LeadLike, activities: Activity[], senderName: string): Promise<{ text: string; ai: boolean }> {
  const fallback = templateFollowUp(lead, senderName);
  if (!process.env.ANTHROPIC_API_KEY) return { text: fallback, ai: false };
  const conv = await db.query.conversations.findFirst({ where: eq(conversations.phone, normalizePhone(lead.phone)) });
  const chat = conv ? await db.query.waMessages.findMany({ where: eq(waMessages.conversationId, conv.id), orderBy: desc(waMessages.createdAt), limit: 8 }) : [];
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 400,
      system: `You write short WhatsApp follow-ups for ${senderName} at Zukhti Home, a turnkey interior design company (Mumbai, Dubai). Warm, professional, specific to what was last discussed, one clear next step (call, site visit, design walkthrough, quote review). Max 60 words. No emojis unless the client used them. Never promise prices, discounts or dates that aren't in the context. Output only the message.`,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            lead: { name: lead.name, stage: lead.status, city: lead.city, property: lead.propertyType, budget: lead.budgetBand, source: lead.source, notes: lead.notes },
            history: activities.slice(0, 6).map((a) => ({ type: a.type, at: a.at.toISOString().slice(0, 10), summary: a.summary })),
            recentWhatsApp: chat.reverse().map((m) => ({ from: m.direction === "IN" ? "client" : "us", text: m.body.slice(0, 300) })),
          }),
        },
      ],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim().replace(/^"|"$/g, "");
    return text ? { text, ai: true } : { text: fallback, ai: false };
  } catch {
    return { text: fallback, ai: false };
  }
}
