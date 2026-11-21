import "server-only";

/**
 * MeltFlex AI (www.meltflexai.com/api): photo-real pictures from our 3D views, short video walk-throughs,
 * and explorable 3D walk-throughs. Needs MELTFLEX_API_KEY. Failed jobs are refunded by MeltFlex.
 */

export const meltflexReady = () => !!process.env.MELTFLEX_API_KEY;
const BASE = () => (process.env.MELTFLEX_API_URL || "https://www.meltflexai.com").replace(/\/$/, "");

export const CREDITS = { photo: { lite: 8, quick: 10, pro: 15 }, video: { 4: 100, 8: 150 }, world: 30 } as const;
export type DesignLevel = "lite" | "quick" | "pro";

function headers() {
  const key = process.env.MELTFLEX_API_KEY;
  if (!key) throw new Error("Photo-real renders aren't set up yet — add MELTFLEX_API_KEY in Vercel and redeploy.");
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export class MeltflexError extends Error {}

async function call(path: string, init: RequestInit & { timeoutMs: number }) {
  const url = path.startsWith("http") ? path : `${BASE()}${path}`;
  // Only ever talk to MeltFlex (poll links come back from the API).
  if (!url.startsWith(BASE() + "/")) throw new MeltflexError("Unexpected MeltFlex link.");
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: headers(), signal: AbortSignal.timeout(init.timeoutMs) });
  } catch (e) {
    throw new MeltflexError((e as Error).name === "TimeoutError" ? "MeltFlex took too long — try again." : `Couldn't reach MeltFlex (${(e as Error).message}).`);
  }
  let j: Record<string, unknown> = {};
  try {
    j = (await res.json()) as Record<string, unknown>;
  } catch {}
  if (res.status === 401) throw new MeltflexError("The MeltFlex key isn't valid. Check MELTFLEX_API_KEY in Vercel.");
  if (res.status === 402) throw new MeltflexError("Out of MeltFlex credits. Top up at meltflexai.com/settings and try again.");
  if (res.status === 429) throw new MeltflexError("MeltFlex is busy — wait a minute and try again.");
  if (!res.ok && res.status !== 202) throw new MeltflexError(`MeltFlex couldn't do that (${res.status})${j.error || j.message ? `: ${j.error || j.message}` : ""}.`);
  return { status: res.status, j };
}

/** Photo-real pictures from one of our 3D views ("photo to render": keeps geometry and camera). */
export async function makePhotos(o: { image: string; prompt: string; level: DesignLevel; variations: number }) {
  const { j } = await call("/api/v1/generate", {
    method: "POST",
    body: JSON.stringify({ image: o.image, prompt: o.prompt, resolution: "2K", designLevel: o.level, variations: Math.min(3, Math.max(1, o.variations)) }),
    timeoutMs: 240_000,
  });
  const images = (Array.isArray(j.images) ? j.images : j.image ? [j.image] : []).filter((x): x is string => typeof x === "string");
  if (!j.success || !images.length) throw new MeltflexError(String(j.error || j.message || "MeltFlex returned no picture — try again."));
  return { images, credits: Number(j.creditsUsed) || undefined };
}

export type JobResult = { status: "ready"; videoUrl?: string; worldId?: string; viewerUrl?: string } | { status: "working"; poll: string } | { status: "failed"; error: string };

function readJob(status: number, j: Record<string, unknown>, pollFallback: string, current?: string): JobResult {
  if (j.status === "FAILED" || (j.error && !j.success)) return { status: "failed", error: String(j.error || "It didn't work (credits refunded).") };
  if (typeof j.videoUrl === "string") return { status: "ready", videoUrl: j.videoUrl };
  if (typeof j.worldId === "string" && j.done !== false) return { status: "ready", worldId: j.worldId, viewerUrl: typeof j.viewerUrl === "string" ? j.viewerUrl : `https://marble.worldlabs.ai/world/${j.worldId}` };
  if (status === 202 || j.done === false || j.status === "IN_PROGRESS") {
    // While polling, a progress reply may not repeat the job id: keep checking the same link.
    const poll = typeof j.pollUrl === "string" ? j.pollUrl : typeof j.operationId === "string" ? `${pollFallback}?operationId=${encodeURIComponent(j.operationId)}` : typeof j.taskId === "string" ? `${pollFallback}?taskId=${encodeURIComponent(j.taskId)}` : (current ?? "");
    if (poll) return { status: "working", poll };
  }
  return { status: "failed", error: String(j.error || j.message || "MeltFlex gave an unexpected answer.") };
}

/** A short camera-move video from a picture. */
export async function startVideo(o: { imageUrl: string; seconds: 4 | 8; prompt?: string }) {
  const { status, j } = await call("/api/v1/video", {
    method: "POST",
    body: JSON.stringify({ imageUrl: o.imageUrl, durationSeconds: o.seconds, aspectRatio: "16:9", ...(o.prompt ? { prompt: o.prompt } : {}) }),
    timeoutMs: 280_000,
  });
  return readJob(status, j, `${BASE()}/api/v1/video`);
}

/** An explorable 3D walk-through from a picture. */
export async function startWorld(o: { image: string; name: string }) {
  const { status, j } = await call("/api/v1/world", { method: "POST", body: JSON.stringify({ image: o.image, model: "draft", name: o.name.slice(0, 64) }), timeoutMs: 280_000 });
  return readJob(status, j, `${BASE()}/api/v1/world`);
}

/** Checks a running video or walk-through. */
export async function pollJob(poll: string) {
  const { status, j } = await call(poll, { method: "GET", timeoutMs: 30_000 });
  return readJob(status, j, poll.split("?")[0], poll);
}
