"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, designRenders, designs } from "@/db";
import { readStoredFile, saveFile } from "@/lib/storage";
import { normaliseLook } from "@/lib/themes";
import { CREDITS, makePhotos, meltflexReady, startVideo, startWorld, type DesignLevel, type JobResult } from "@/lib/meltflex";
import { signSource } from "@/lib/render-sign";
import { assertProjectAccess } from "./data";

const done = (id: string) => revalidatePath(`/projects/${id}`, "layout");

async function load(projectId: string, designId: string) {
  const { user, project } = await assertProjectAccess(projectId, "design");
  const d = await db.query.designs.findFirst({ where: and(eq(designs.id, designId), eq(designs.projectId, project.id)) });
  if (!d?.scene) throw new Error("Not a 3D home.");
  return { user, project, d };
}
async function origin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
const dataUrl = async (url: string) => {
  const f = await readStoredFile(url);
  return `data:${f.type};base64,${f.bytes.toString("base64")}`;
};
const setJob = (id: string, r: JobResult) =>
  db
    .update(designRenders)
    .set(
      r.status === "ready"
        ? { status: "ready", url: r.videoUrl ?? r.viewerUrl ?? null, worldId: r.worldId ?? null, poll: null, updatedAt: new Date() }
        : r.status === "working"
          ? { status: "working", poll: r.poll, updatedAt: new Date() }
          : { status: "failed", error: r.error.slice(0, 300), poll: null, updatedAt: new Date() },
    )
    .where(eq(designRenders.id, id));
/** Marks any still-running jobs as failed with a plain message. */
const fail = (ids: string[], e: unknown) =>
  Promise.all(
    ids.map((id) =>
      db
        .update(designRenders)
        .set({ status: "failed", error: ((e as Error).message || "Something went wrong.").slice(0, 300), updatedAt: new Date() })
        .where(and(eq(designRenders.id, id), eq(designRenders.status, "working"))),
    ),
  );

/** Makes 1–3 photo-real pictures of a saved shot. Runs in the background; the page checks back. */
export async function makePhotoReal(form: FormData) {
  try {
    if (!meltflexReady()) return { error: "Photo-real renders aren't set up yet — add MELTFLEX_API_KEY in Vercel and redeploy." };
    const { user, project, d } = await load(String(form.get("projectId")), String(form.get("id")));
    const look = normaliseLook(d.look, d.render?.interiorStyle);
    const shot = look.shots.find((s) => s.id === String(form.get("shotId")));
    if (!shot?.url) return { error: "Save the view as a shot first." };
    const prompt = String(form.get("prompt") ?? "").trim().slice(0, 3000);
    if (prompt.length < 20) return { error: "Write a little more in the instruction." };
    const level = (["lite", "quick", "pro"].includes(String(form.get("level"))) ? String(form.get("level")) : "quick") as DesignLevel;
    const variations = Math.min(3, Math.max(1, Number(form.get("variations")) || 1));
    const rows = await db
      .insert(designRenders)
      .values(Array.from({ length: variations }, () => ({ designId: d.id, shotId: shot.id, kind: "photo", status: "working", prompt, sourceUrl: shot.url, credits: CREDITS.photo[level], createdById: user.id })))
      .returning({ id: designRenders.id });
    const ids = rows.map((r) => r.id);
    after(async () => {
      try {
        const { images } = await makePhotos({ image: await dataUrl(shot.url!), prompt, level, variations });
        for (const [i, id] of ids.entries()) {
          const img = images[i];
          if (!img) {
            await db.update(designRenders).set({ status: "failed", error: "MeltFlex returned fewer pictures (refunded).", updatedAt: new Date() }).where(eq(designRenders.id, id));
            continue;
          }
          const [meta, b64] = img.split(",");
          const type = /image\/(png|jpeg|webp)/.exec(meta)?.[0] ?? "image/png";
          const file = new File([new Uint8Array(Buffer.from(b64, "base64"))], `photo.${type.split("/")[1]}`, { type });
          const url = await saveFile(file, `designs/${project.id}`);
          await db.update(designRenders).set({ status: "ready", url, updatedAt: new Date() }).where(eq(designRenders.id, id));
        }
      } catch (e) {
        console.error("makePhotoReal:", (e as Error).message);
        await fail(ids, e);
      }
    });
    return { ids };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

async function parentPhoto(projectId: string, designId: string, renderId: string) {
  const ctx = await load(projectId, designId);
  const p = await db.query.designRenders.findFirst({ where: and(eq(designRenders.id, renderId), eq(designRenders.designId, ctx.d.id)) });
  if (!p || p.kind !== "photo" || p.status !== "ready" || !p.url) throw new Error("Pick a finished photo-real picture.");
  return { ...ctx, p };
}

/** A 4- or 8-second camera-move video from a photo-real picture. */
export async function makeVideo(form: FormData) {
  try {
    if (!meltflexReady()) return { error: "Add MELTFLEX_API_KEY in Vercel first." };
    const { user, project, d, p } = await parentPhoto(String(form.get("projectId")), String(form.get("id")), String(form.get("renderId")));
    const seconds = Number(form.get("seconds")) === 8 ? 8 : 4;
    const [row] = await db.insert(designRenders).values({ designId: d.id, shotId: p.shotId, parentId: p.id, kind: "video", status: "working", sourceUrl: p.url, credits: CREDITS.video[seconds], createdById: user.id }).returning({ id: designRenders.id });
    const src = `${await origin()}/api/renders/src/${p.id}?${signSource(p.id, 3 * 3600)}`;
    const motion = String(form.get("motion") ?? "").trim().slice(0, 300) || "Slow, smooth cinematic camera move forward through the room, steady, realistic, no people.";
    after(async () => {
      try {
        await setJob(row.id, await startVideo({ imageUrl: src, seconds, prompt: motion }));
      } catch (e) {
        await fail([row.id], e);
      }
    });
    done(project.id);
    return { id: row.id };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** An explorable 3D walk-through from a photo-real picture. */
export async function makeWalkthrough(form: FormData) {
  try {
    if (!meltflexReady()) return { error: "Add MELTFLEX_API_KEY in Vercel first." };
    const { user, project, d, p } = await parentPhoto(String(form.get("projectId")), String(form.get("id")), String(form.get("renderId")));
    const [row] = await db.insert(designRenders).values({ designId: d.id, shotId: p.shotId, parentId: p.id, kind: "world", status: "working", sourceUrl: p.url, credits: CREDITS.world, createdById: user.id }).returning({ id: designRenders.id });
    const name = `${project.name} — ${d.title}`;
    after(async () => {
      try {
        await setJob(row.id, await startWorld({ image: await dataUrl(p.url!), name }));
      } catch (e) {
        await fail([row.id], e);
      }
    });
    done(project.id);
    return { id: row.id };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function setRenderChosen(projectId: string, designId: string, renderId: string, chosen: boolean) {
  const { project, d } = await load(projectId, designId);
  await db.update(designRenders).set({ chosen }).where(and(eq(designRenders.id, renderId), eq(designRenders.designId, d.id)));
  done(project.id);
  return { ok: true };
}

export async function deleteRender(projectId: string, designId: string, renderId: string) {
  const { project, d } = await load(projectId, designId);
  await db.delete(designRenders).where(and(eq(designRenders.designId, d.id), eq(designRenders.parentId, renderId)));
  await db.delete(designRenders).where(and(eq(designRenders.id, renderId), eq(designRenders.designId, d.id)));
  done(project.id);
  return { ok: true };
}
