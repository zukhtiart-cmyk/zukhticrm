import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { callTool } from "./ai-call";
import type { AssistantAction, AssistantContext } from "./assistant-types";

/**
 * Zuki reads a photo: a shop bill → site expense, a contractor's bill → running bill,
 * a measurement sheet → room sizes for the AI BOQ, a defect → snag.
 */
const TOOL = {
  name: "read_photo",
  description: "Report what this photo is and the details in it.",
  input_schema: {
    type: "object" as const,
    properties: {
      kind: {
        type: "string",
        enum: [
          "shop_bill",
          "contractor_bill",
          "measurement_sheet",
          "defect",
          "site_progress",
          "other",
        ],
      },
      summary: {
        type: "string",
        description: "One short sentence describing the photo.",
      },
      vendor: {
        type: "string",
        description: "Shop / supplier name on a bill.",
      },
      total: {
        type: "number",
        description: "Grand total payable on the bill (numbers only).",
      },
      bill_date: { type: "string", description: "YYYY-MM-DD if visible." },
      items: {
        type: "string",
        description:
          "Short list of items on the bill, e.g. '20 bags white cement, 2 tile adhesive'.",
      },
      category: {
        type: "string",
        enum: [
          "Material",
          "Labour",
          "Transport",
          "Tools & consumables",
          "Food & site",
          "Other",
        ],
      },
      contractor_id: {
        type: "string",
        description:
          "Contractor bills: id from the contractor list if the name matches, else empty.",
      },
      contractor_name: { type: "string" },
      work: {
        type: "string",
        description:
          "Contractor bills: work covered, e.g. 'RA2 – kitchen carcass and shutters'.",
      },
      project_id: {
        type: "string",
        description:
          "Only if the photo clearly names a site/client from the project list.",
      },
      rooms: {
        type: "array",
        description:
          "Measurement sheets: each room/wall with sizes as written.",
        items: {
          type: "object",
          properties: {
            room: { type: "string" },
            size: {
              type: "string",
              description: "e.g. '14 x 12 ft', 'wall A 3.2 m'",
            },
            note: { type: "string" },
          },
          required: ["room", "size"],
        },
      },
      room: { type: "string", description: "Defects: room/area if visible." },
      defect: {
        type: "string",
        description: "Defects: what needs fixing, in clear English.",
      },
      legible: {
        type: "boolean",
        description: "False if the photo is too blurry/dark to read.",
      },
    },
    required: ["kind", "summary", "legible"],
  },
};

type Read = {
  kind: string;
  summary: string;
  vendor?: string;
  total?: number;
  items?: string;
  category?: string;
  contractor_id?: string;
  contractor_name?: string;
  work?: string;
  project_id?: string;
  rooms?: { room: string; size: string; note?: string }[];
  room?: string;
  defect?: string;
  legible: boolean;
};

export async function readPhoto(
  file: File,
  ctx: AssistantContext,
  hint?: string,
): Promise<{ action: AssistantAction | null; reply: string; read: Read }> {
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const media = (
    ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)
      ? file.type
      : "image/jpeg"
  ) as "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const read = await callTool<Read>(
    client,
    {
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 1200,
      system: `You read photos for Zukhti Home, a turnkey interior design company in India and Dubai. Identify the photo and pull out the details exactly as printed or handwritten — never guess numbers you can't read; leave them out and set legible=false if the key numbers can't be read.
Projects (id | name | client):
${ctx.projects.map((p) => `${p.id} | ${p.name} | ${p.client}`).join("\n") || "(none)"}
Contractors (id | name | trade):
${ctx.contractors.map((c) => `${c.id} | ${c.name} | ${c.trade}`).join("\n") || "(none)"}`,
      tools: [TOOL],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: media, data },
            },
            {
              type: "text",
              text: hint ? `The person said: "${hint}"` : "What is this photo?",
            },
          ],
        },
      ],
    },
    TOOL.name,
  );

  const projectId =
    read.project_id && ctx.projects.some((p) => p.id === read.project_id)
      ? read.project_id
      : null;
  const contractorId =
    read.contractor_id &&
    ctx.contractors.some((c) => c.id === read.contractor_id)
      ? read.contractor_id
      : null;
  const money = (n?: number) =>
    n ? Math.round(n).toLocaleString("en-IN") : "";

  if (!read.legible && read.kind !== "defect" && read.kind !== "site_progress")
    return {
      action: null,
      read,
      reply:
        "I can't read this clearly — please retake the photo in good light, flat and close up.",
    };

  switch (read.kind) {
    case "shop_bill":
      return {
        read,
        action: {
          type: "expense",
          projectId,
          amount: read.total ?? null,
          paidTo: read.vendor ?? null,
          description: (read.items || read.summary).slice(0, 300),
          category: read.category ?? "Material",
        },
        reply: `That's a bill${read.vendor ? ` from ${read.vendor}` : ""}${read.total ? ` for ${money(read.total)}` : ""}. I've made a site expense with the photo attached.`,
      };
    case "contractor_bill":
      return {
        read,
        action: {
          type: "bill",
          projectId,
          contractorId,
          contractorName: contractorId ? null : (read.contractor_name ?? null),
          amount: read.total ?? null,
          note: (read.work || read.summary).slice(0, 300),
        },
        reply: `That's a contractor bill${read.contractor_name ? ` from ${read.contractor_name}` : ""}${read.total ? ` for ${money(read.total)}` : ""}. I'll submit it as a running bill for approval.`,
      };
    case "measurement_sheet": {
      const sizes = (read.rooms ?? [])
        .map((r) => `${r.room}: ${r.size}${r.note ? ` (${r.note})` : ""}`)
        .join("; ");
      return {
        read,
        action: {
          type: "measurements",
          projectId,
          text: sizes ? `Site measurements — ${sizes}` : read.summary,
        },
        reply: sizes
          ? `I read ${read.rooms!.length} room size${read.rooms!.length > 1 ? "s" : ""}. Open it to draft the BOQ from these.`
          : "I couldn't read clear sizes from this sheet.",
      };
    }
    case "defect":
      return {
        read,
        action: {
          type: "snag",
          projectId,
          room: read.room ?? null,
          description: (read.defect || read.summary).slice(0, 500),
        },
        reply: `Looks like a snag: ${read.defect || read.summary}. I've attached the photo.`,
      };
    case "site_progress":
      return {
        read,
        action: {
          type: "project_update",
          projectId,
          text: hint || read.summary,
        },
        reply: `A site photo — ${read.summary}. Tell me what's happening, or open it as a project update.`,
      };
    default:
      return {
        read,
        action: null,
        reply: `I see: ${read.summary}. Tell me what to do with it.`,
      };
  }
}
