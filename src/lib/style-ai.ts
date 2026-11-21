import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { callTool } from "./ai-call";
import { BED_STYLES, CEILING_STYLES, FEATURE_TREATMENTS, FINISH_KINDS, FIXTURE_STYLES, LEG_STYLES, SOFA_STYLES, cleanRoomStyle, cleanTheme, type RoomStyle, type Theme } from "./themes";

const hex = { type: "string", description: "Colour as #rrggbb, sampled from the picture" } as const;
const finish = {
  type: "object",
  properties: { kind: { type: "string", enum: [...FINISH_KINDS] }, base: hex, alt: { ...hex, description: "Second colour: grain/veins/grout, #rrggbb" } },
  required: ["kind", "base", "alt"],
} as const;

const STYLE_PROPS = {
  floor: { ...finish, description: "Main floor finish" },
  wall: { ...hex, description: "Main wall paint colour" },
  feature: {
    type: "object",
    description: "The feature/accent wall (behind a bed or TV)",
    properties: { treatment: { type: "string", enum: [...FEATURE_TREATMENTS] }, color: hex },
    required: ["treatment", "color"],
  },
  wood: { ...hex, description: "Main wood tone (furniture, doors)" },
  woodDark: { ...hex, description: "Darker wood / trims" },
  fabric: { ...hex, description: "Main upholstery colour (sofa, headboard)" },
  fabricAlt: { ...hex, description: "Second fabric colour (bedding, cushions, chairs)" },
  accent: { ...hex, description: "Accent colour (cushions, art, décor)" },
  metal: { ...hex, description: "Metal finish colour (brass ~#c8a25a, black ~#1d1d1d, chrome ~#d9d9d9)" },
  rug: hex,
  curtains: hex,
  cabinet: { ...hex, description: "Cabinet / wardrobe shutter colour" },
  counter: { ...hex, description: "Kitchen or vanity counter-top colour" },
  bed: { type: "string", enum: [...BED_STYLES] },
  sofa: { type: "string", enum: [...SOFA_STYLES] },
  legs: { type: "string", enum: [...LEG_STYLES] },
  ceiling: { type: "string", enum: [...CEILING_STYLES] },
  fixture: { type: "string", enum: [...FIXTURE_STYLES], description: "Ceiling light style" },
} as const;

const ROOM_TOOL: Anthropic.Messages.Tool = {
  name: "save_room_style",
  description: "Save what the reference picture shows, as settings for a 3D room. Only include things the picture clearly shows.",
  input_schema: {
    type: "object",
    properties: {
      note: { type: "string", description: "One or two short sentences a designer would say about the picture: materials, colours, key pieces." },
      wallpaper_closeup: { type: "boolean", description: "true if the picture is mostly a close-up of a wallpaper / tile / fabric PATTERN that could be repeated on a wall" },
      ...STYLE_PROPS,
    },
    required: ["note"],
  },
};

const THEME_TOOL: Anthropic.Messages.Tool = {
  name: "save_theme",
  description: "Save one design theme that captures what these mood-board pictures have in common.",
  input_schema: {
    type: "object",
    properties: {
      label: { type: "string", description: "Short theme name, 2–3 words, e.g. 'Warm Walnut Luxe'" },
      blurb: { type: "string", description: "One line: key materials and colours" },
      wetFloor: { ...finish, description: "Bathroom floor finish" },
      decor: { type: "integer", minimum: 0, maximum: 3, description: "How much décor: 0 bare … 3 layered" },
      ...STYLE_PROPS,
    },
    required: ["label", "blurb", "floor", "wetFloor", "wall", "feature", "wood", "woodDark", "fabric", "fabricAlt", "accent", "metal", "rug", "curtains", "cabinet", "counter", "bed", "sofa", "legs", "ceiling", "fixture", "decor"],
  },
};

const SYSTEM = `You are an interior designer at a turnkey design firm in India and Dubai. You look at reference pictures (often from Pinterest) and translate them precisely into settings for a 3D model of a client's home.
Sample colours from the picture itself (real #rrggbb values, not generic names). Pick the closest option for each style choice. Leave out anything the picture doesn't show.`;

type Img = { data: string; mediaType: string };
const client = () => {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Reading pictures needs ANTHROPIC_API_KEY in Vercel.");
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
};
const model = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const imageBlock = (i: Img): Anthropic.Messages.ImageBlockParam => ({ type: "image", source: { type: "base64", media_type: i.mediaType as "image/jpeg", data: i.data } });

/** Reads one reference picture for a room. */
export async function readRoomReference(img: Img, room: { name: string; type: string }, hint?: string) {
  const out = await callTool<Record<string, unknown>>(
    client(),
    {
      model: model(),
      max_tokens: 1500,
      system: SYSTEM,
      tools: [ROOM_TOOL],
      messages: [{ role: "user", content: [imageBlock(img), { type: "text", text: `Reference for the room "${room.name}" (${room.type.replace("_", " ")}).${hint ? ` Designer's note: ${hint}` : ""}` }] }],
    },
    ROOM_TOOL.name,
    60_000,
  );
  return { style: cleanRoomStyle(out) as RoomStyle, note: typeof out.note === "string" ? out.note.slice(0, 400) : "", wallpaper: !!out.wallpaper_closeup };
}

/** Turns a mood board (several pictures) into one theme. */
export async function readMoodBoard(imgs: Img[], hint?: string): Promise<Theme> {
  const out = await callTool<Record<string, unknown>>(
    client(),
    {
      model: model(),
      max_tokens: 2000,
      system: SYSTEM,
      tools: [THEME_TOOL],
      messages: [{ role: "user", content: [...imgs.map(imageBlock), { type: "text", text: `These pictures are one mood board for a whole home. Make one theme from what they share.${hint ? ` Designer's note: ${hint}` : ""}` }] }],
    },
    THEME_TOOL.name,
    90_000,
  );
  return cleanTheme(out);
}
