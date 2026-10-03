import { and, asc, eq, sql } from "drizzle-orm";
import { db, milestones, projects, stages, boqItems } from "@/db";
import { DEFAULT_MILESTONES, DEFAULT_STAGES } from "./defaults";
import { round2 } from "./format";

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Creates a project with the standard stages and payment schedule. */
export async function createProjectWithDefaults(
  tx: Db | Tx,
  input: { name: string; clientId: string; officeId: string; siteAddress?: string | null; managerId?: string | null; expectedHandover?: Date | null },
) {
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(projects);
  const code = `ZK-${new Date().getFullYear()}-${String(n + 1).padStart(3, "0")}`;
  const [project] = await tx
    .insert(projects)
    .values({ ...input, code })
    .returning();
  const createdStages = await tx
    .insert(stages)
    .values(DEFAULT_STAGES.map((name, i) => ({ projectId: project.id, name, order: i + 1 })))
    .returning();
  await tx.insert(milestones).values(
    DEFAULT_MILESTONES.map((m, i) => ({
      projectId: project.id,
      label: m.label,
      percent: m.percent,
      amount: 0,
      sortOrder: i,
      dueStageId: m.stage ? (createdStages.find((s) => s.name === m.stage)?.id ?? null) : null,
    })),
  );
  return project;
}

/** Overall progress = average of stage progress. */
export async function recomputeProjectProgress(tx: Db | Tx, projectId: string) {
  const rows = await tx.select({ progress: stages.progress }).from(stages).where(eq(stages.projectId, projectId)).orderBy(asc(stages.order));
  const pct = rows.length ? Math.round(rows.reduce((a, r) => a + r.progress, 0) / rows.length) : 0;
  await tx.update(projects).set({ progress: pct }).where(eq(projects.id, projectId));
  return pct;
}

/** Contract value = BOQ sell total incl. tax; milestone amounts follow their percentages. */
export async function syncMilestoneAmounts(tx: Db | Tx, projectId: string, taxRate: number) {
  const items = await tx.select().from(boqItems).where(eq(boqItems.projectId, projectId));
  const subtotal = items.reduce((a, i) => a + i.qty * i.unitPrice, 0);
  const total = round2(subtotal * (1 + taxRate / 100));
  const ms = await tx.select().from(milestones).where(eq(milestones.projectId, projectId));
  for (const m of ms) {
    if (m.status === "PAID") continue;
    await tx
      .update(milestones)
      .set({ amount: round2((total * m.percent) / 100) })
      .where(and(eq(milestones.id, m.id), eq(milestones.projectId, projectId)));
  }
  return total;
}
