"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { clients, db, designs } from "@/db";
import { saveFile } from "@/lib/storage";
import { readFloorPlan } from "@/lib/floorplan-ai";
import { INTERIOR_STYLES, type HomeScene, type InteriorStyle } from "@/lib/home-scene";
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

// ---------- Floor plan → 3D home ----------

const PLAN_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** Reads a floor plan with Claude and saves the 3D home as a draft design. The browser then saves its picture. */
export async function createHomeFromPlan(_: unknown, form: FormData) {
  const { user, project } = await assertProjectAccess(String(form.get("projectId")), "design");
  const plan = form.get("plan");
  if (!(plan instanceof File) || plan.size === 0) return { error: "Choose the floor plan (image or PDF)." };
  if (!PLAN_TYPES.includes(plan.type)) return { error: "Upload the plan as a JPG, PNG, WebP image or a PDF." };
  if (plan.size > (plan.type === "application/pdf" ? 20 : 5) * 1024 * 1024) return { error: plan.type === "application/pdf" ? "That PDF is too large (max 20 MB)." : "That image is too large (max 5 MB)." };
  const style = (INTERIOR_STYLES as readonly string[]).includes(String(form.get("style"))) ? (String(form.get("style")) as InteriorStyle) : "modern";
  const hint = String(form.get("hint") ?? "").trim().slice(0, 300);

  let scene: HomeScene;
  try {
    scene = await readFloorPlan({ data: Buffer.from(await plan.arrayBuffer()).toString("base64"), mediaType: plan.type }, hint || undefined);
  } catch (e) {
    const msg = (e as Error).message;
    const status = (e as { status?: number }).status;
    console.error("createHomeFromPlan:", status, msg);
    if (status === 401 || status === 403) return { error: "The Claude key (ANTHROPIC_API_KEY) isn't valid — check it in Vercel." };
    if (status === 429 || status === 529 || status === 503) return { error: "Claude is busy right now — try again in a minute." };
    if (status && status >= 400) return { error: "Claude couldn't read that plan. Try a clearer image, or a PDF of the plan." };
    return { error: /timed? ?out|timeout/i.test(msg) ? "Reading the plan took too long — try a smaller or clearer image." : msg };
  }
  const planUrl = await saveFile(plan, `designs/${project.id}`);
  const room = String(form.get("room") ?? "").trim() || "Whole home";
  const title = String(form.get("title") ?? "").trim() || "3D home";
  const prev = await db.query.designs.findFirst({
    where: and(eq(designs.projectId, project.id), eq(designs.room, room), eq(designs.title, title)),
    orderBy: desc(designs.version),
  });
  const [row] = await db
    .insert(designs)
    .values({
      projectId: project.id,
      room,
      title,
      version: (prev?.version ?? 0) + 1,
      fileUrl: planUrl,
      fileType: plan.type === "application/pdf" ? "pdf" : "image",
      notes: String(form.get("notes") ?? "").trim() || null,
      status: "DRAFT",
      uploadedById: user.id,
      render: { planUrl, interiorStyle: style, snapshot: false },
      scene,
    })
    .returning({ id: designs.id });
  done(project.id);
  return { ok: "Your 3D home is ready.", id: row.id, rooms: scene.rooms.length };
}

/** Saves the 3D picture (and the chosen look) for a design made from a floor plan. */
export async function saveHomeSnapshot(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "design");
  const d = await db.query.designs.findFirst({ where: and(eq(designs.id, String(form.get("id"))), eq(designs.projectId, project.id)) });
  if (!d?.scene) return { error: "Not a 3D home." };
  const file = form.get("file");
  const style = String(form.get("style") ?? "");
  const styleOk = (INTERIOR_STYLES as readonly string[]).includes(style);
  // A shared design keeps its look; the team saves a new version for a different one.
  if (d.status !== "DRAFT" && styleOk && style !== d.render?.interiorStyle) return { error: "This design is with the client — make a new version to change the look." };
  const set: Partial<typeof designs.$inferInsert> = {};
  if (file instanceof File && file.size > 0 && file.type === "image/jpeg" && file.size < 8 * 1024 * 1024) {
    set.fileUrl = await saveFile(file, `designs/${project.id}`);
    set.fileType = "image";
  }
  set.render = { ...(d.render ?? {}), snapshot: !!set.fileUrl || !!d.render?.snapshot, interiorStyle: styleOk ? style : d.render?.interiorStyle };
  await db.update(designs).set(set).where(eq(designs.id, d.id));
  done(project.id);
  return { ok: true };
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
