"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { clients, db, designs } from "@/db";
import { readStoredFile, saveFile } from "@/lib/storage";
import { RENDER_OPTIONS, type RenderOptions, renderFloorPlan, startWorld } from "@/lib/render3d";
import { newPortalToken } from "@/lib/portal";
import { assertProjectAccess } from "./data";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const done = (id: string) => revalidatePath(`/projects/${id}`, "layout");

export async function uploadDesign(_: unknown, form: FormData) {
  const { user, project } = await assertProjectAccess(String(form.get("projectId")), "design");
  const file = form.get("file");
  const room = String(form.get("room") ?? "").trim() || "General";
  const title = String(form.get("title") ?? "").trim();
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a render or PDF to upload." };
  if (!ALLOWED.includes(file.type)) return { error: "Upload a JPG, PNG, WebP image or a PDF." };
  if (file.size > 20 * 1024 * 1024) return { error: "File is too large (max 20 MB)." };
  if (!title) return { error: "Give the design a title, e.g. 'Living room 3D view'." };

  const prev = await db.query.designs.findFirst({
    where: and(eq(designs.projectId, project.id), eq(designs.room, room), eq(designs.title, title)),
    orderBy: desc(designs.version),
  });
  const fileUrl = await saveFile(file, `designs/${project.id}`);
  await db.insert(designs).values({
    projectId: project.id,
    room,
    title,
    version: (prev?.version ?? 0) + 1,
    fileUrl,
    fileType: file.type === "application/pdf" ? "pdf" : "image",
    notes: String(form.get("notes") ?? "").trim() || null,
    status: form.get("share") === "on" ? "PENDING" : "DRAFT",
    sharedAt: form.get("share") === "on" ? new Date() : null,
    uploadedById: user.id,
  });
  done(project.id);
  return { ok: prev ? `Uploaded as version ${prev.version + 1}.` : "Uploaded." };
}

export async function shareDesign(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "design");
  await db
    .update(designs)
    .set({ status: "PENDING", sharedAt: new Date(), clientComment: null, decidedAt: null })
    .where(and(eq(designs.id, String(form.get("id"))), eq(designs.projectId, project.id), eq(designs.status, "DRAFT")));
  done(project.id);
}

export async function unshareDesign(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "design");
  await db
    .update(designs)
    .set({ status: "DRAFT", sharedAt: null })
    .where(and(eq(designs.id, String(form.get("id"))), eq(designs.projectId, project.id), eq(designs.status, "PENDING")));
  done(project.id);
}

export async function deleteDesign(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "design");
  await db.delete(designs).where(and(eq(designs.id, String(form.get("id"))), eq(designs.projectId, project.id), eq(designs.status, "DRAFT")));
  done(project.id);
}

// ---------- Floor plan → 3D (MeltFlex) ----------

const PLAN_TYPES = ["image/jpeg", "image/png", "image/webp"];
const pick = <T extends readonly string[]>(list: T, v: FormDataEntryValue | null, fallback: T[number]): T[number] =>
  (list as readonly string[]).includes(String(v)) ? (String(v) as T[number]) : fallback;
const nice = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace("-", " ");

export async function renderFromFloorPlan(_: unknown, form: FormData) {
  const { user, project } = await assertProjectAccess(String(form.get("projectId")), "design");
  const plan = form.get("plan");
  if (!(plan instanceof File) || plan.size === 0) return { error: "Choose the floor plan image." };
  if (plan.type === "application/pdf") return { error: "MeltFlex reads images only — take a screenshot of the PDF page (JPG or PNG) and upload that." };
  if (!PLAN_TYPES.includes(plan.type)) return { error: "Upload the plan as a JPG, PNG or WebP image." };
  if (plan.size > 10 * 1024 * 1024) return { error: "The plan image is too large (max 10 MB)." };

  const opts: RenderOptions = {
    style: pick(RENDER_OPTIONS.style, form.get("style"), "photorealistic"),
    interiorStyle: pick(RENDER_OPTIONS.interiorStyle, form.get("interiorStyle"), "auto"),
    furniture: pick(RENDER_OPTIONS.furniture, form.get("furniture"), "styled"),
    view: pick(RENDER_OPTIONS.view, form.get("view"), "isometric"),
    labels: pick(RENDER_OPTIONS.labels, form.get("labels"), "none"),
  };
  const room = String(form.get("room") ?? "").trim() || "Floor plan";
  const look = opts.interiorStyle !== "auto" && (opts.style === "photorealistic" || opts.style === "3d-model") ? nice(opts.interiorStyle) : nice(opts.style);
  const title = String(form.get("title") ?? "").trim() || `3D view — ${look}, ${opts.furniture === "empty" ? "empty" : "furnished"}${opts.view === "topdown" ? ", top-down" : ""}`;

  let made: Awaited<ReturnType<typeof renderFloorPlan>>;
  try {
    made = await renderFloorPlan(plan, opts);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const planUrl = await saveFile(plan, `designs/${project.id}`);
  const ext = made.bytes[0] === 0xff ? "jpg" : made.bytes[0] === 0x52 ? "webp" : "png";
  const out = new File([new Uint8Array(made.bytes)], `render.${ext}`, { type: ext === "jpg" ? "image/jpeg" : `image/${ext}` });
  const fileUrl = await saveFile(out, `designs/${project.id}`);

  const prev = await db.query.designs.findFirst({
    where: and(eq(designs.projectId, project.id), eq(designs.room, room), eq(designs.title, title)),
    orderBy: desc(designs.version),
  });
  await db.insert(designs).values({
    projectId: project.id,
    room,
    title,
    version: (prev?.version ?? 0) + 1,
    fileUrl,
    fileType: "image",
    notes: String(form.get("notes") ?? "").trim() || null,
    status: "DRAFT",
    uploadedById: user.id,
    render: { planUrl, sourceUrl: made.sourceUrl ?? undefined, style: opts.style, interiorStyle: opts.interiorStyle, furniture: opts.furniture, view: opts.view },
  });
  done(project.id);
  return { ok: `Render ready (${made.credits} credits) — check it below, then share it with the client or build a walk-through.` };
}

export async function buildWalkthrough(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "design");
  const d = await db.query.designs.findFirst({ where: and(eq(designs.id, String(form.get("id"))), eq(designs.projectId, project.id)) });
  if (!d || d.fileType !== "image") return;
  if (d.worldStatus === "building" || d.worldId) return; // never pay twice
  try {
    let source: { imageUrl?: string; image?: string };
    if (d.render?.sourceUrl) source = { imageUrl: d.render.sourceUrl };
    else if (/^https?:\/\//.test(d.fileUrl)) source = { imageUrl: d.fileUrl };
    else {
      const f = await readStoredFile(d.fileUrl);
      source = { image: `data:${f.type};base64,${f.bytes.toString("base64")}` };
    }
    await db.update(designs).set({ worldStatus: "building", worldOperation: null }).where(eq(designs.id, d.id));
    const w = await startWorld(source, `${project.name} — ${d.title}`);
    await db
      .update(designs)
      .set(w.status === "ready" ? { worldId: w.worldId, worldStatus: "ready" } : { worldOperation: w.operationId, worldStatus: "building" })
      .where(eq(designs.id, d.id));
  } catch (e) {
    await db.update(designs).set({ worldStatus: `failed: ${(e as Error).message}`.slice(0, 300) }).where(eq(designs.id, d.id));
  }
  done(project.id);
}

/** Clears a failed walk-through so it can be tried again. */
export async function resetWalkthrough(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "design");
  await db
    .update(designs)
    .set({ worldStatus: null, worldOperation: null })
    .where(and(eq(designs.id, String(form.get("id"))), eq(designs.projectId, project.id)));
  done(project.id);
}

// ---------- Client portal link ----------

export async function enablePortal(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "projects.edit");
  await db.update(clients).set({ portalToken: newPortalToken() }).where(eq(clients.id, project.clientId));
  done(project.id);
}

export async function disablePortal(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "projects.edit");
  await db.update(clients).set({ portalToken: null }).where(eq(clients.id, project.clientId));
  done(project.id);
}
