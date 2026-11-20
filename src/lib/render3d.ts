import "server-only";

/**
 * Floor plan → 3D, through MeltFlex AI (www.meltflexai.com/api).
 * - render: a furnished 3D picture of the plan (~20 s, 10 credits)
 * - world:  an explorable walk-through built from a render (~1 min, 30 credits)
 * Needs MELTFLEX_API_KEY in Vercel. Credits are refunded by MeltFlex if a build fails.
 */

const BASE = () => (process.env.MELTFLEX_API_URL || "https://www.meltflexai.com").replace(/\/$/, "");

export const RENDER_OPTIONS = {
  style: ["photorealistic", "3d-model", "drawing", "sketch", "clay"],
  interiorStyle: ["auto", "modern", "luxury", "minimalist", "japandi", "scandinavian", "traditional", "industrial", "coastal"],
  furniture: ["styled", "furnished", "empty"],
  view: ["isometric", "topdown"],
  labels: ["none", "names", "full"],
} as const;

export type RenderOptions = {
  style: (typeof RENDER_OPTIONS.style)[number];
  interiorStyle: (typeof RENDER_OPTIONS.interiorStyle)[number];
  furniture: (typeof RENDER_OPTIONS.furniture)[number];
  view: (typeof RENDER_OPTIONS.view)[number];
  labels: (typeof RENDER_OPTIONS.labels)[number];
};

export const render3dReady = () => !!process.env.MELTFLEX_API_KEY;

function headers() {
  const key = process.env.MELTFLEX_API_KEY;
  if (!key) throw new Error("3D renders aren't set up yet — add MELTFLEX_API_KEY in Vercel and redeploy.");
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

/** Plain-English errors for the people using the CRM. */
async function fail(res: Response): Promise<never> {
  let msg = "";
  try {
    const j = (await res.json()) as { error?: string; message?: string };
    msg = j.error || j.message || "";
  } catch {}
  if (res.status === 401) throw new Error("The MeltFlex key isn't valid. Check MELTFLEX_API_KEY in Vercel.");
  if (res.status === 402) throw new Error("Out of MeltFlex credits. Top up at meltflexai.com/settings and try again.");
  if (res.status === 429) throw new Error("MeltFlex is busy — wait a minute and try again.");
  throw new Error(`MeltFlex couldn't do that (${res.status})${msg ? `: ${msg}` : ""}.`);
}

/** A furnished 3D picture of a floor plan. Returns the image bytes and MeltFlex's hosted URL. */
export async function renderFloorPlan(plan: File, opts: RenderOptions) {
  const dataUrl = `data:${plan.type};base64,${Buffer.from(await plan.arrayBuffer()).toString("base64")}`;
  const body: Record<string, string> = { image: dataUrl, output: "render", style: opts.style, view: opts.view, furniture: opts.furniture, labels: opts.labels };
  if (opts.style === "photorealistic" || opts.style === "3d-model") body.interiorStyle = opts.interiorStyle;
  const res = await fetch(`${BASE()}/api/v1/floorplan-to-3d`, { method: "POST", headers: headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(55_000) });
  if (!res.ok) await fail(res);
  const j = (await res.json()) as { success?: boolean; imageUrl?: string; image?: string; error?: string; creditsUsed?: number };
  if (!j.success) throw new Error(j.error || "MeltFlex couldn't render that plan. Try a cleaner image of the plan.");
  let bytes: Buffer;
  if (j.imageUrl) {
    const img = await fetch(j.imageUrl, { signal: AbortSignal.timeout(30_000) });
    if (!img.ok) throw new Error("The render was made but couldn't be downloaded — try again.");
    bytes = Buffer.from(await img.arrayBuffer());
  } else if (j.image?.startsWith("data:")) bytes = Buffer.from(j.image.split(",")[1], "base64");
  else throw new Error("MeltFlex returned no picture — try again.");
  return { bytes, sourceUrl: j.imageUrl ?? null, credits: j.creditsUsed ?? 10 };
}

type WorldReply = { success?: boolean; done?: boolean; status?: string; worldId?: string; operationId?: string; error?: string; refunded?: boolean };

/** Starts a walk-through from a render. Usually returns "building" with an operation to poll. */
export async function startWorld(source: { imageUrl?: string; image?: string }, name: string) {
  const res = await fetch(`${BASE()}/api/v1/world`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ ...source, model: "draft", name: name.slice(0, 64) }),
    signal: AbortSignal.timeout(50_000),
  }).catch((e) => {
    // A long build can outlast our request; MeltFlex keeps going, but we can't see the job id.
    throw new Error(`Couldn't reach MeltFlex (${(e as Error).message}). Try again in a minute.`);
  });
  if (res.status !== 200 && res.status !== 202) await fail(res);
  const j = (await res.json()) as WorldReply;
  if (j.worldId && (j.done || res.status === 200)) return { status: "ready" as const, worldId: j.worldId };
  if (j.operationId) return { status: "building" as const, operationId: j.operationId };
  throw new Error(j.error || "MeltFlex didn't start the walk-through — try again.");
}

/** Checks a building walk-through. */
export async function checkWorld(operationId: string) {
  const res = await fetch(`${BASE()}/api/v1/world?operationId=${encodeURIComponent(operationId)}`, { headers: headers(), signal: AbortSignal.timeout(20_000) });
  if (!res.ok && res.status !== 202) await fail(res);
  const j = (await res.json()) as WorldReply;
  if (j.status === "FAILED" || j.error) return { status: "failed" as const, error: j.error || "The walk-through failed (credits refunded)." };
  if (j.worldId && j.done !== false) return { status: "ready" as const, worldId: j.worldId };
  return { status: "building" as const };
}

/** MeltFlex's hosted viewer for a world — stays valid; the raw files behind it are refreshed by MeltFlex. */
export const worldViewerUrl = (worldId: string) => `https://marble.worldlabs.ai/world/${encodeURIComponent(worldId)}`;
