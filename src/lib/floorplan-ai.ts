import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { callTool } from "./ai-call";
import { ROOM_TYPES, parseReading, sceneFromReading, type HomeScene, type RawReading } from "./home-scene";

const pt = { type: "number", description: "0–1000" } as const;

const TOOL: Anthropic.Messages.Tool = {
  name: "save_floor_plan",
  description: "Save the floor plan. All coordinates are in thousandths of the image: x = 0 at the left edge … 1000 at the right edge, y = 0 at the top … 1000 at the bottom.",
  input_schema: {
    type: "object",
    properties: {
      image_width_m: { type: "number", description: "Real-world width covered by the WHOLE image, left edge to right edge, in metres." },
      scale_ref: {
        type: "object",
        description: "One clearly labelled dimension: its two end points on the image and its real length in metres. Prefer a long overall dimension line.",
        properties: { x1: pt, y1: pt, x2: pt, y2: pt, length_m: { type: "number" } },
        required: ["x1", "y1", "x2", "y2", "length_m"],
      },
      walls: {
        type: "string",
        description:
          "Every wall, ONE PER LINE, as: x1,y1,x2,y2,K — the wall's CENTRE line end to end, then its kind K: F = full wall, FE = full exterior (outer) wall, H = half/low wall or parapet, G = glass partition, R = balcony/terrace railing. Example line: 120,85,640,85,FE",
      },
      openings: {
        type: "string",
        description:
          "Every door/archway/sliding door/window, ONE PER LINE, as: wall,x,y,width_m,T — wall = 0-based line number of the wall it sits on, x,y = its centre, width_m = clear width in metres, T: D = hinged door, O = open archway/gap, S = sliding door, W = window. Add ,M at the end for the main entrance door. Example: 3,402,85,1.05,D,M",
      },
      rooms: {
        type: "array",
        description: "Each named space as the rectangle of its floor area (inside its walls or, where it is open to a neighbour, up to the imaginary line between them). An L-shaped room = two rectangles with the same name.",
        items: {
          type: "object",
          properties: { name: { type: "string" }, type: { type: "string", enum: [...ROOM_TYPES] }, x1: pt, y1: pt, x2: pt, y2: pt },
          required: ["name", "type", "x1", "y1", "x2", "y2"],
        },
      },
      notes: { type: "array", items: { type: "string" }, description: "Short notes on anything unclear or assumed." },
    },
    required: ["image_width_m", "walls", "openings", "rooms", "notes"],
  },
};

const SYSTEM = `You trace architectural floor plans (mostly Indian and UAE apartments and villas) for a 3D model. Accuracy matters more than speed.

Coordinates: thousandths of the image — x from 0 (left edge of the image) to 1000 (right edge), y from 0 (top edge) to 1000 (bottom edge). Measure carefully against the image, not the room labels.

1. SCALE. Find a labelled dimension (e.g. 12'0" or 3650) and give its end points and real length in scale_ref; 1 ft = 0.3048 m, 1 inch = 0.0254 m; plain numbers like 3650 are millimetres. Also give image_width_m for the whole image width.
2. WALLS. Trace every wall that is drawn — thick dark lines or hatched bands — along its centre line. Corners meet exactly (shared end points). A wall that has doors or windows in it is ONE segment; the openings go in the openings list.
   - Only trace walls that are actually drawn. Where two spaces are open to each other (living to dining, open kitchen, foyer into living, passage into hall) there is NO wall — leave it out.
   - kind: full for normal walls; half for low walls, parapets or partitions drawn thinner/dashed; glass for glass partitions (thin double lines); railing for balcony/terrace edges.
   - exterior: true for the outer walls of the home.
3. OPENINGS. Doors (a quarter-circle swing), sliding doors (overlapping thin panels), archways/plain gaps in a wall, and windows (thin double/triple lines in an outer wall). Give the centre point, width in metres, and the index of the wall it is on.
4. ROOMS. Each label on the plan becomes a room rectangle covering its floor, with the closest type (a hall with sofa and dining = living_dining; toilet/bath/washroom = bathroom; WC without shower = powder; dress = store).
Ignore furniture symbols, text, dimension lines and the north arrow when tracing walls.`;

/** Reads a floor plan image with Claude and returns the 3D scene, ready for checking. */
export async function readFloorPlan(img: { data: string; mediaType: string; width: number; height: number }, opts: { hint?: string; underlayUrl?: string } = {}): Promise<HomeScene> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Reading floor plans needs ANTHROPIC_API_KEY in Vercel.");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const reading = await callTool<RawReading>(
    client,
    {
      model: process.env.ANTHROPIC_PLAN_MODEL || process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 12000,
      system: SYSTEM,
      tools: [TOOL],
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: img.mediaType as "image/jpeg" | "image/png" | "image/webp", data: img.data } },
            { type: "text", text: `Trace this floor plan. The image is ${img.width} × ${img.height} pixels.${opts.hint ? ` Designer's note: ${opts.hint}` : ""}` },
          ],
        },
      ],
    },
    TOOL.name,
    240_000,
  );
  return sceneFromReading(parseReading(reading), img.width, img.height, opts.underlayUrl);
}
