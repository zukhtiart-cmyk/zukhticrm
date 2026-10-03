import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { boqItems, db, milestones, orders, photos, projects, quotes, siteUpdates, stages, visits } from "@/db";
import { officeScope, requireUser } from "@/lib/auth";
import type { Capability } from "@/lib/permissions";

/** Loads a project the current user may see; 404 otherwise. */
export async function loadProject(id: string, capability: Capability = "projects.view") {
  const user = await requireUser(capability);
  const scope = officeScope(user);
  const project = await db.query.projects.findFirst({
    where: scope ? and(eq(projects.id, id), eq(projects.officeId, scope)) : eq(projects.id, id),
    with: {
      client: true,
      office: true,
      manager: true,
      stages: { orderBy: asc(stages.order) },
      updates: { orderBy: desc(siteUpdates.createdAt), with: { author: true, stage: true, photos: { orderBy: asc(photos.createdAt) } }, limit: 50 },
      boqItems: { orderBy: [asc(boqItems.room), asc(boqItems.createdAt)] },
      quotes: { orderBy: desc(quotes.version) },
      milestones: { orderBy: asc(milestones.sortOrder), with: { dueStage: true } },
      orders: { orderBy: desc(orders.updatedAt) },
      visits: { orderBy: asc(visits.at) },
    },
  });
  if (!project) notFound();
  return { user, project };
}

export type LoadedProject = Awaited<ReturnType<typeof loadProject>>["project"];

/** For server actions: verify access without loading everything. */
export async function assertProjectAccess(id: string, capability: Capability) {
  const user = await requireUser(capability);
  const scope = officeScope(user);
  const project = await db.query.projects.findFirst({
    where: scope ? and(eq(projects.id, id), eq(projects.officeId, scope)) : eq(projects.id, id),
    with: { office: true },
  });
  if (!project) throw new Error("Project not found");
  return { user, project };
}
