"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, orderStatusEnum, orders, projectStatusEnum, projects, stageStatusEnum, stages, visits } from "@/db";
import { recomputeProjectProgress } from "@/lib/projects";
import { assertProjectAccess } from "./data";

const date = (v: FormDataEntryValue | null) => (v ? new Date(`${v}T10:00:00`) : null);
const done = (id: string) => revalidatePath(`/projects/${id}`, "layout");

export async function updateProject(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "projects.edit");
  await db
    .update(projects)
    .set({
      name: String(form.get("name") || project.name),
      siteAddress: String(form.get("siteAddress") ?? "") || null,
      status: z.enum(projectStatusEnum.enumValues).parse(form.get("status")),
      startDate: date(form.get("startDate")),
      expectedHandover: date(form.get("expectedHandover")),
      managerId: String(form.get("managerId") ?? "") || null,
    })
    .where(eq(projects.id, project.id));
  done(project.id);
}

export async function updateStage(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "stages");
  const stageId = String(form.get("stageId"));
  let progress = Math.max(0, Math.min(100, Number(form.get("progress")) || 0));
  let status = z.enum(stageStatusEnum.enumValues).parse(form.get("status"));
  if (status === "DONE") progress = 100;
  else if (progress === 100) status = "DONE";
  else if (progress > 0 && status === "NOT_STARTED") status = "IN_PROGRESS";
  const current = await db.query.stages.findFirst({ where: and(eq(stages.id, stageId), eq(stages.projectId, project.id)) });
  if (!current) return;
  await db
    .update(stages)
    .set({
      status,
      progress,
      plannedEnd: date(form.get("plannedEnd")),
      actualStart: current.actualStart ?? (progress > 0 ? new Date() : null),
      actualEnd: status === "DONE" ? (current.actualEnd ?? new Date()) : null,
    })
    .where(eq(stages.id, stageId));
  await recomputeProjectProgress(db, project.id);
  if (project.status === "DESIGN" && status !== "NOT_STARTED" && current.order > 1) {
    await db.update(projects).set({ status: "ACTIVE" }).where(eq(projects.id, project.id));
  }
  done(project.id);
}

export async function addVisit(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "visits");
  const at = String(form.get("at") ?? "");
  const title = String(form.get("title") ?? "").trim();
  if (!at || !title) return;
  await db.insert(visits).values({ projectId: project.id, title, at: new Date(at), notes: String(form.get("notes") ?? "") || null });
  done(project.id);
}

export async function deleteVisit(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "visits");
  await db.delete(visits).where(and(eq(visits.id, String(form.get("id"))), eq(visits.projectId, project.id)));
  done(project.id);
}

export async function saveOrder(form: FormData) {
  const { project } = await assertProjectAccess(String(form.get("projectId")), "orders");
  const values = {
    item: String(form.get("item") ?? "").trim(),
    vendor: String(form.get("vendor") ?? "").trim() || null,
    status: z.enum(orderStatusEnum.enumValues).parse(form.get("status")),
    eta: date(form.get("eta")),
    notes: String(form.get("notes") ?? "").trim() || null,
  };
  if (!values.item) return;
  const id = String(form.get("id") ?? "");
  if (id) await db.update(orders).set(values).where(and(eq(orders.id, id), eq(orders.projectId, project.id)));
  else await db.insert(orders).values({ ...values, projectId: project.id });
  done(project.id);
}
