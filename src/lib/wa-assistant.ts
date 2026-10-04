import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { statusMessage, type ProjectFacts } from "./wa-facts";

export type Intent = "status" | "photos" | "payment" | "design" | "delivery" | "visit" | "greeting" | "thanks" | "human" | "other";

export type AssistantReply = {
  intent: Intent;
  reply: string;
  sendPhotos: boolean;
  /** Hand the conversation to a person (complaint, negotiation, unknown answer…). */
  handover: boolean;
  reason?: string;
};

export const HANDOVER_REPLY = (first: string, pm: string | null) =>
  `Thank you ${first}. I've passed this to ${pm ? `${pm}, your project manager` : "your project manager"}, who will get back to you shortly. 🙏`;

// ---------- Rule-based (works without any AI key) ----------

const has = (t: string, words: string[]) => words.some((w) => t.includes(w));

export function classify(text: string): Intent {
  const t = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ")} `;
  if (has(t, [" talk ", " human ", " manager ", " call me ", " complain", " complaint", " problem", " issue ", " unhappy", " not happy", " angry", " refund", " discount", " cancel", " delay", " late ", " bad ", " poor ", " worst", " negotiat", " lawyer", " legal "])) return "human";
  if (has(t, [" photo", " pic", " picture", " image", " video", " फोटो", " tasveer", " صور"])) return "photos";
  if (has(t, [" payment", " pay ", " paid", " invoice", " due ", " amount", " balance", " bill ", " paisa", " paise", " installment", " instalment", " दफ़ा", " भुगतान", " دفع"])) return "payment";
  if (has(t, [" design", " render", " 3d ", " drawing", " layout", " approve", " approval", " moodboard"])) return "design";
  if (has(t, [" deliver", " delivery", " order", " shipped", " shipping", " furniture", " sofa", " arrive", " dispatch", " container", " customs"])) return "delivery";
  if (has(t, [" visit", " meeting", " appointment", " come to site", " walkthrough", " मीटिंग"])) return "visit";
  if (has(t, [" thank", " thanks", " thx", " great ", " ok ", " okay", " 👍", " धन्यवाद", " شكرا"])) return "thanks";
  if (has(t, [" status", " update", " progress", " stage", " kab ", " kitna", " how much", " how is", " when will", " handover", " done ", " complete", " kaam", " काम", " स्थिति"])) return "status";
  if (has(t, [" hi ", " hello", " hey ", " namaste", " नमस्ते", " salam", " مرحبا", " good morning", " good evening"])) return "greeting";
  return "other";
}

export function ruleReply(text: string, f: ProjectFacts): AssistantReply {
  const intent = classify(text);
  const first = f.clientFirstName;
  const portal = f.portalLink ? `\nMore details: ${f.portalLink}` : "";
  switch (intent) {
    case "human":
      return { intent, reply: HANDOVER_REPLY(first, f.projectManager), sendPhotos: false, handover: true, reason: "Client asked for a person or raised a concern" };
    case "photos":
      return f.photoCount
        ? { intent, reply: `Here are the latest photos from your site, ${first}.${portal}`, sendPhotos: true, handover: false }
        : { intent, reply: `No new site photos have been shared yet, ${first}. I've asked the team to send some.`, sendPhotos: false, handover: true, reason: "Client asked for photos; none shared yet" };
    case "payment": {
      const next = f.payments.next;
      return {
        intent,
        reply: `${first}, paid so far: *${f.payments.paidSoFar}*.` + (next ? `\nNext payment: *${next.amount}* (${next.label}), due at ${next.dueAt}.` : "\nAll payments are complete. Thank you!") + portal,
        sendPhotos: false,
        handover: false,
      };
    }
    case "design":
      return {
        intent,
        reply: f.designsAwaitingApproval.length
          ? `${first}, these designs are waiting for your approval: ${f.designsAwaitingApproval.join(", ")}. You can approve or comment here: ${f.portalLink ?? "your project link"}`
          : `${first}, there are no designs waiting for your approval right now.${portal}`,
        sendPhotos: false,
        handover: false,
      };
    case "delivery": {
      const items = f.deliveries;
      return items.length
        ? { intent, reply: `${first}, here's where your items are:\n${items.map((d) => `• ${d.item}: ${d.status}${d.expected ? `, around ${d.expected}` : ""}`).join("\n")}`, sendPhotos: false, handover: false }
        : { intent, reply: `${first}, no furniture or fittings are on order yet for your project. Your project manager will update you once they are.`, sendPhotos: false, handover: false };
    }
    case "visit":
      return f.upcomingVisits.length
        ? { intent, reply: `${first}, your next visit: *${f.upcomingVisits[0].title}* on ${f.upcomingVisits[0].when}.`, sendPhotos: false, handover: false }
        : { intent, reply: `${first}, there's no visit scheduled right now. I've asked your project manager to arrange one with you.`, sendPhotos: false, handover: true, reason: "Client asked about a visit; none scheduled" };
    case "thanks":
      return { intent, reply: `You're welcome, ${first}! 😊`, sendPhotos: false, handover: false };
    case "greeting":
    case "status":
      return { intent, reply: statusMessage(f), sendPhotos: false, handover: false };
    default:
      return { intent, reply: `${statusMessage(f)}\n\n(If you asked something else, your project manager will reply shortly.)`, sendPhotos: false, handover: true, reason: "Question not understood automatically" };
  }
}

// ---------- AI (Claude) ----------

const TOOL = {
  name: "whatsapp_reply",
  description: "Reply to a client's WhatsApp message about their interior project.",
  input_schema: {
    type: "object" as const,
    properties: {
      intent: { type: "string", enum: ["status", "photos", "payment", "design", "delivery", "visit", "greeting", "thanks", "human", "other"] },
      reply: { type: "string", description: "The WhatsApp reply. Short, warm, in the client's language. WhatsApp formatting only (*bold*). No markdown headings or links other than the portal link." },
      send_photos: { type: "boolean", description: "True if the latest site photos should be sent after the reply." },
      handover: { type: "boolean", description: "True if a person must take over." },
      reason: { type: "string", description: "Short internal reason when handing over." },
    },
    required: ["intent", "reply", "send_photos", "handover"],
  },
};

function system(f: ProjectFacts) {
  return `You are the WhatsApp assistant for Zukhti Home, a premium turnkey interior design company. You reply to ${f.clientName} about their project.

Rules:
- Use ONLY the facts below. Never guess dates, amounts, progress or delivery times. If the answer isn't in the facts, say the project manager will confirm and set handover=true.
- Set handover=true for complaints, unhappiness, delays raised by the client, price or contract negotiation, requests to speak to someone, legal or refund topics, or anything sensitive.
- Never mention costs other than the payment facts given, vendors, factories, margins, internal problems, or other clients.
- Reply in the same language the client wrote in (English, Hindi, Hinglish or Arabic). Keep it short and warm, like a helpful project coordinator. Use *bold* sparingly.
- For a general "status/update" question give: current stage and overall %, the latest update, what's next, expected handover; mention the portal link for photos and details if available.
- If they ask for photos and photoCount > 0, set send_photos=true.
- Always call the whatsapp_reply tool.

Project facts:
${JSON.stringify({ ...f, latestPhotoUrls: undefined, projectId: undefined }, null, 1)}`;
}

export async function aiReply(text: string, f: ProjectFacts, history: { direction: "IN" | "OUT"; body: string }[]): Promise<AssistantReply> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const context = history
    .slice(-6)
    .map((m) => `${m.direction === "IN" ? "Client" : "Zukhti"}: ${m.body}`)
    .join("\n");
  const res = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    max_tokens: 800,
    system: system(f),
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content: `${context ? `Recent conversation:\n${context}\n\n` : ""}New message from the client:\n"""${text}"""` }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("No reply from AI");
  const out = block.input as { intent: Intent; reply: string; send_photos: boolean; handover: boolean; reason?: string };
  const reply = (out.reply ?? "").trim();
  if (!reply) throw new Error("Empty reply from AI");
  return {
    intent: out.intent ?? "other",
    reply: reply.slice(0, 3500),
    sendPhotos: !!out.send_photos && f.photoCount > 0,
    handover: !!out.handover,
    reason: out.reason,
  };
}

/** AI when configured; rules otherwise or if the AI call fails. A request for a person is always honoured. */
export async function decideReply(text: string, f: ProjectFacts, history: { direction: "IN" | "OUT"; body: string }[]): Promise<AssistantReply & { mode: "ai" | "rules" }> {
  const rules = ruleReply(text, f);
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const ai = await aiReply(text, f, history);
      if (rules.intent === "human" && !ai.handover) return { ...ai, handover: true, reason: rules.reason, mode: "ai" };
      return { ...ai, mode: "ai" };
    } catch (e) {
      console.error("whatsapp AI reply failed; using rules", e);
    }
  }
  return { ...rules, mode: "rules" };
}
