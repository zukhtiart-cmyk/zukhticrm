import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { callTool } from "./ai-call";
import { ROOM_TYPES, normaliseScene, type HomeScene } from "./home-scene";

const TOOL: Anthropic.Messages.Tool = {
  name: "save_floor_plan",
  description: "Save the floor plan as rectangles in metres.",
  input_schema: {
    type: "object",
    properties: {
      rooms: {
        type: "array",
        description: "Every space on the plan, including passages, balconies and bathrooms. Rectangles that tile the plan without overlapping; neighbouring rooms share an edge exactly.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name as written on the plan, e.g. 'Master Bedroom', 'Toilet 2'." },
            type: { type: "string", enum: [...ROOM_TYPES] },
            x: { type: "number", description: "Left edge, metres from the plan's left side" },
            y: { type: "number", description: "Top edge, metres from the plan's top side" },
            w: { type: "number", description: "Width left→right in metres (inside size)" },
            d: { type: "number", description: "Depth top→bottom in metres (inside size)" },
          },
          required: ["name", "type", "x", "y", "w", "d"],
        },
      },
      doors: {
        type: "array",
        description: "Door openings: centre point on the wall line, and clear width.",
        items: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, main: { type: "boolean", description: "true for the flat's main entrance" } },
          required: ["x", "y", "width"],
        },
      },
      windows: {
        type: "array",
        description: "Windows and balcony sliding doors on outside walls: centre point on the wall line, and width.",
        items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" } }, required: ["x", "y", "width"] },
      },
      notes: { type: "array", items: { type: "string" }, description: "Short notes on anything unclear or assumed, e.g. 'No sizes on plan; assumed 3.0 m bedrooms'." },
    },
    required: ["rooms", "doors", "windows", "notes"],
  },
};

const SYSTEM = `You read architectural floor plans (mostly Indian and UAE apartments and villas) and convert them into exact rectangles in metres for a 3D model.

How to work:
1. Find the scale. Use the written room sizes (often feet-inches like 12'0" x 10'6" — the first number is usually the horizontal size as drawn; convert: 1 ft = 0.3048 m) or dimension lines. If there are none, assume sensible sizes (bedroom ≈ 3.3 × 3.6 m, bathroom ≈ 1.5 × 2.4 m).
2. Put the origin at the top-left corner of the whole plan. x grows to the right, y grows downward.
3. List every space as an axis-aligned rectangle. Rooms must not overlap and must touch where they touch on the plan — shared walls are a single shared edge (same coordinate on both rooms). Ignore wall thickness: rooms sit edge to edge.
4. An L-shaped or irregular room = two or more rectangles with the same name. Include passages, foyers, balconies, utility areas and ducts you can walk into (skip shafts).
5. Doors: centre point on the shared edge between the two spaces, plus clear width (usually 0.75–1.0 m; main door 1.0–1.1 m). Mark the main entrance with main=true. An opening without a door shutter is still a door.
6. Windows: centre point on the outside edge and width. Sliding doors to a balcony count as windows on that edge AND a door.
7. Room type: choose the closest. A hall with both sofa and dining = living_dining. Toilet/bath/washroom = bathroom; a small toilet without shower = powder.
Be precise — the 3D model is built straight from your numbers.`;

/** Reads a floor plan image or PDF with Claude and returns a clean 3D scene. */
export async function readFloorPlan(file: { data: string; mediaType: string }, hint?: string): Promise<HomeScene> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Reading floor plans needs ANTHROPIC_API_KEY in Vercel.");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const doc: Anthropic.Messages.ContentBlockParam =
    file.mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.data } }
      : { type: "image", source: { type: "base64", media_type: file.mediaType as "image/jpeg" | "image/png" | "image/webp", data: file.data } };
  const out = await callTool<unknown>(
    client,
    {
      model: process.env.ANTHROPIC_PLAN_MODEL || process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 6000,
      system: SYSTEM,
      tools: [TOOL],
      messages: [{ role: "user", content: [doc, { type: "text", text: `Convert this floor plan.${hint ? ` Designer's note: ${hint}` : ""}` }] }],
    },
    TOOL.name,
    52_000,
  );
  return normaliseScene(out);
}
