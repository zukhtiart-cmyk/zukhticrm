"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, designs, designThemes } from "@/db";
import { saveFile } from "@/lib/storage";
import { normaliseScene } from "@/lib/home-scene";
import { normaliseLook, type Look, type Shot } from "@/lib/themes";
import { readMoodBoard, readRoomReference } from "@/lib/style-ai";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { assertProjectAccess } from "./data";

const done = (id: string) => revalidatePath(`/projects/${id}`, "layout");
const IMG = ["image/jpeg", "image/png", "image/webp"];

async function load(projectId: string, id: string) {
  const { user, project } = await assertProjectAccess(projectId, "design");
  const d = await db.query.designs.findFirst({ where: and(eq(designs.id, id), eq(designs.projectId, project.id)) });
  if (!d?.scene) throw new Error("Not a 3D home.");
  return { user, project, d };
}

function friendly(e: unknown) {
  const status = (e as { status?: number }).status;
  if (status === 401 || status === 403) return "The Claude key (ANTHROPIC_API_KEY) isn't valid — check it in Vercel.";
  if (status === 429 || status === 529 || status === 503) return "Claude is busy right now — try again in a minute.";
  return (e as Error).message || "Something went wrong.";
}

/**
 * Saves the theme, mood and room styling (and a fresh picture for the design card).
 * A design that's already with the client is saved as a new draft version.
 */
export async function saveLook(form: FormData) {
  try {
    const { user, project, d } = await load(String(form.get("projectId")), String(form.get("id")));
    const look = normaliseLook(JSON.parse(String(form.get("look") ?? "{}")));
    // Shots belong to the design; keep the stored ones (they're saved separately).
    look.shots = normaliseLook(d.look).shots;
    const file = form.get("file");
    const fileUrl = file instanceof File && file.type === "image/jpeg" && file.size > 0 && file.size < 8 * 1024 * 1024 ? await saveFile(file, `designs/${project.id}`) : null;
    const render = { ...(d.render ?? {}), interiorStyle: look.theme, snapshot: !!fileUrl || !!d.render?.snapshot };
    if (d.status === "DRAFT") {
      await db
        .update(designs)
        .set({ look, render, ...(fileUrl ? { fileUrl, fileType: "image" } : {}) })
        .where(eq(designs.id, d.id));
      done(project.id);
      return { id: d.id };
    }
    const prev = await db.query.designs.findFirst({ where: and(eq(designs.projectId, project.id), eq(designs.room, d.room), eq(designs.title, d.title)), orderBy: desc(designs.version) });
    const [row] = await db
      .insert(designs)
      .values({ projectId: project.id, room: d.room, title: d.title, version: (prev?.version ?? d.version) + 1, fileUrl: fileUrl ?? d.fileUrl, fileType: "image", status: "DRAFT", uploadedById: user.id, render, scene: d.scene, look })
      .returning({ id: designs.id });
    done(project.id);
    return { id: row.id, newVersion: true };
  } catch (e) {
    return { error: friendly(e) };
  }
}

/** Saves the current camera view as a named shot (with its picture). */
export async function saveShot(form: FormData) {
  try {
    const { project, d } = await load(String(form.get("projectId")), String(form.get("id")));
    const file = form.get("file");
    if (!(file instanceof File) || file.type !== "image/jpeg" || file.size > 8 * 1024 * 1024) return { error: "No picture to save." };
    const cam = JSON.parse(String(form.get("cam") ?? "null")) as Shot["cam"];
    const look = normaliseLook(d.look, d.render?.interiorStyle);
    if (look.shots.length >= 40) return { error: "That's the maximum of 40 shots — delete some first." };
    const url = await saveFile(file, `designs/${project.id}`);
    const shot = { id: Math.random().toString(36).slice(2, 10), name: String(form.get("name") ?? "").trim().slice(0, 60) || `Shot ${look.shots.length + 1}`, url, cam, mood: String(form.get("mood") ?? look.mood) };
    const next = normaliseLook({ ...look, shots: [...look.shots, shot] });
    await db.update(designs).set({ look: next }).where(eq(designs.id, d.id));
    done(project.id);
    return { shots: next.shots };
  } catch (e) {
    return { error: friendly(e) };
  }
}

export async function deleteShot(projectId: string, id: string, shotId: string) {
  try {
    const { project, d } = await load(projectId, id);
    const look = normaliseLook(d.look, d.render?.interiorStyle);
    look.shots = look.shots.filter((s) => s.id !== shotId);
    await db.update(designs).set({ look }).where(eq(designs.id, d.id));
    done(project.id);
    return { shots: look.shots };
  } catch (e) {
    return { error: friendly(e) };
  }
}

/** Reads a reference picture (e.g. from Pinterest) for one room and returns the styling it suggests. */
export async function readReference(form: FormData) {
  try {
    const { project, d } = await load(String(form.get("projectId")), String(form.get("id")));
    const file = form.get("file");
    if (!(file instanceof File) || !IMG.includes(file.type)) return { error: "Use a JPG, PNG or WebP picture." };
    if (file.size > 5 * 1024 * 1024) return { error: "That picture is too large (max 5 MB)." };
    const roomName = String(form.get("room") ?? "");
    const scene = normaliseScene(d.scene);
    const room = scene.rooms.find((r) => r.name === roomName) ?? { name: roomName || "Room", type: "other" };
    const url = await saveFile(file, `designs/${project.id}`);
    const res = await readRoomReference({ data: Buffer.from(await file.arrayBuffer()).toString("base64"), mediaType: file.type }, room, String(form.get("hint") ?? "").slice(0, 200) || undefined);
    return { url, ...res };
  } catch (e) {
    return { error: friendly(e) };
  }
}

/** Makes a new theme for the firm's library from a Pinterest mood board. */
export async function createThemeFromBoard(form: FormData) {
  try {
    const user = await requireUser();
    if (!can(user.role, "design")) return { error: "Only the design team can add themes." };
    const files = form.getAll("files").filter((f): f is File => f instanceof File && IMG.includes(f.type) && f.size > 0 && f.size <= 5 * 1024 * 1024).slice(0, 8);
    if (!files.length) return { error: "Add 1–8 pictures (JPG, PNG or WebP)." };
    const imgs = await Promise.all(files.map(async (f) => ({ data: Buffer.from(await f.arrayBuffer()).toString("base64"), mediaType: f.type })));
    const theme = await readMoodBoard(imgs, String(form.get("hint") ?? "").slice(0, 200) || undefined);
    const name = String(form.get("name") ?? "").trim().slice(0, 40) || theme.label;
    const refs = await Promise.all(files.map(async (f) => ({ url: await saveFile(f, "designs/themes") })));
    const [row] = await db.insert(designThemes).values({ name, theme: { ...theme, label: name }, refs, createdById: user.id }).returning();
    const saved = { ...row.theme, id: `custom:${row.id}`, label: name };
    await db.update(designThemes).set({ theme: saved }).where(eq(designThemes.id, row.id));
    return { theme: saved };
  } catch (e) {
    return { error: friendly(e) };
  }
}

export async function deleteTheme(id: string) {
  const user = await requireUser();
  if (!can(user.role, "design")) return { error: "Not allowed." };
  await db.delete(designThemes).where(eq(designThemes.id, id.replace(/^custom:/, "")));
  return { ok: true };
}

/** Copies a 3D home as another design option (e.g. "Option B") to style differently. */
export async function makeOption(form: FormData) {
  try {
    const { user, project, d } = await load(String(form.get("projectId")), String(form.get("id")));
    const existing = await db.query.designs.findMany({ where: and(eq(designs.projectId, project.id), eq(designs.room, d.room)), columns: { title: true } });
    const used = new Set(existing.map((e) => e.title));
    let title = String(form.get("title") ?? "").trim().slice(0, 60);
    if (!title) {
      for (const L of "BCDEFGHIJ") if (!used.has(`Option ${L}`)) {
        title = `Option ${L}`;
        break;
      }
    }
    if (used.has(title)) return { error: `There's already a design called "${title}" — pick another name.` };
    const look: Look = { ...normaliseLook(d.look, d.render?.interiorStyle), shots: [] };
    const [row] = await db
      .insert(designs)
      .values({ projectId: project.id, room: d.room, title, version: 1, fileUrl: d.fileUrl, fileType: d.fileType, status: "DRAFT", uploadedById: user.id, render: { ...(d.render ?? {}), snapshot: false }, scene: d.scene, look })
      .returning({ id: designs.id });
    done(project.id);
    return { id: row.id };
  } catch (e) {
    return { error: friendly(e) };
  }
}
