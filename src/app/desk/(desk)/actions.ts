"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db, projects } from "@/db";
import { requireUser } from "@/lib/auth";
import { officeScope } from "@/lib/permissions";
import { applyVoiceUpdate, type ConfirmInput } from "@/lib/voice-apply";

export async function confirmVoiceUpdate(input: ConfirmInput) {
  const user = await requireUser("voice");
  const h = await headers();
  const appUrl = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const res = await applyVoiceUpdate(user, input, appUrl);
  if (res.ok) {
    revalidatePath(`/projects/${res.projectId}`, "layout");
    revalidatePath("/");
    revalidatePath("/desk");
  }
  return res;
}

/** Saves the phone's current position as the project's site location (for "nearest site" on the desk). */
export async function setSiteLocation(projectId: string, lat: number, lng: number) {
  const user = await requireUser("voice");
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { error: "Invalid location" };
  const scope = officeScope(user);
  const res = await db
    .update(projects)
    .set({ siteLat: lat, siteLng: lng })
    .where(scope ? and(eq(projects.id, projectId), eq(projects.officeId, scope)) : eq(projects.id, projectId))
    .returning({ id: projects.id });
  if (!res.length) return { error: "Project not found" };
  revalidatePath("/desk");
  return { ok: true };
}
