import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, milestones, orderStatusEnum, orders, photos, projects, siteUpdates, stageStatusEnum, stages, visits } from "@/db";
import { officeScope } from "@/lib/permissions";
import type { Role } from "@/db/schema";
import { can } from "@/lib/permissions";
import { money } from "@/lib/format";
import { recomputeProjectProgress } from "@/lib/projects";
import { sendClientUpdate } from "@/lib/whatsapp";
import { officeTimeZone } from "@/lib/voice-context";

export const confirmSchema = z.object({
  projectId: z.string(),
  transcript: z.string().max(20000),
  audioUrl: z.string().optional().nullable(),
  summary: z.string().trim().min(1).max(2000),
  stageUpdates: z.array(z.object({ stageId: z.string(), status: z.enum(stageStatusEnum.enumValues), progress: z.number().int().min(0).max(100) })),
  payments: z.array(z.object({ milestoneId: z.string(), amount: z.number().positive(), reference: z.string().optional(), paidOn: z.string().optional() })),
  orders: z.array(z.object({ orderId: z.string().nullable(), item: z.string().min(1), vendor: z.string().optional(), status: z.enum(orderStatusEnum.enumValues), eta: z.string().optional() })),
  visits: z.array(z.object({ visitId: z.string().nullable(), title: z.string().min(1), at: z.string().min(10) })),
  designNotes: z.array(z.string()),
  issues: z.array(z.string()),
  photos: z.array(z.object({ url: z.string(), clientVisible: z.boolean() })).max(20),
  sendToClient: z.boolean(),
  clientMessage: z.string().max(4000),
});

export type ConfirmInput = z.infer<typeof confirmSchema>;

const OFFSETS: Record<string, string> = { "Asia/Kolkata": "+05:30", "Asia/Dubai": "+04:00", "Asia/Shanghai": "+08:00" };

/** "2026-10-06" or "2026-10-06T11:00" in the office's local time → Date */
function officeDate(v: string | undefined, tz: string, defaultTime = "10:00") {
  if (!v) return null;
  const withTime = v.length === 10 ? `${v}T${defaultTime}` : v.slice(0, 16);
  const d = new Date(`${withTime}:00${OFFSETS[tz] ?? "Z"}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type ApplyResult = { ok: true; updateId: string; projectId: string; sendStatus: string | null; changes: string[] } | { ok: false; error: string };

/** Validates and applies a confirmed voice update for this user. Shared by the server action and tests. */
export async function applyVoiceUpdate(user: { id: string; role: Role; officeId: string | null }, input: ConfirmInput, appUrl: string): Promise<ApplyResult> {
  if (!can(user.role, "voice")) return { ok: false, error: "Not allowed." };
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Some details look incomplete — please check the card." };
  const data = parsed.data;

  const scope = officeScope(user);
  const project = await db.query.projects.findFirst({
    where: scope ? and(eq(projects.id, data.projectId), eq(projects.officeId, scope)) : eq(projects.id, data.projectId),
    with: { client: true, office: true, stages: true, milestones: true, orders: true, visits: true },
  });
  if (!project) return { ok: false, error: "Project not found." };
  const tz = officeTimeZone(project.office.currency);

  // Role checks: drop anything the speaker isn't allowed to change.
  const stageUpdates = can(user.role, "stages") ? data.stageUpdates.filter((s) => project.stages.some((p) => p.id === s.stageId)) : [];
  const payments = can(user.role, "payments") ? data.payments.filter((p) => project.milestones.some((m) => m.id === p.milestoneId)) : [];
  const orderChanges = can(user.role, "orders") ? data.orders : [];
  const visitChanges = can(user.role, "visits") ? data.visits : [];
  const designNotes = can(user.role, "design") ? data.designNotes.filter(Boolean) : [];

  const changes: string[] = [];
  const updateId = await db.transaction(async (tx) => {
    for (const s of stageUpdates) {
      const stage = project.stages.find((x) => x.id === s.stageId)!;
      const progress = s.status === "DONE" ? 100 : s.progress;
      const status = progress === 100 ? "DONE" : progress > 0 && s.status === "NOT_STARTED" ? "IN_PROGRESS" : s.status;
      await tx
        .update(stages)
        .set({
          status,
          progress,
          actualStart: stage.actualStart ?? (progress > 0 ? new Date() : null),
          actualEnd: status === "DONE" ? (stage.actualEnd ?? new Date()) : null,
        })
        .where(eq(stages.id, stage.id));
      changes.push(status === "DONE" ? `${stage.name}: complete` : `${stage.name}: ${progress}%`);
    }
    for (const p of payments) {
      const m = project.milestones.find((x) => x.id === p.milestoneId)!;
      await tx
        .update(milestones)
        .set({ status: "PAID", paidAmount: p.amount, paidAt: officeDate(p.paidOn, tz) ?? new Date(), reference: p.reference || null })
        .where(eq(milestones.id, m.id));
      changes.push(`Payment received: ${money(p.amount, project.office.currency)} for ${m.label}`);
    }
    for (const o of orderChanges) {
      const values = { item: o.item, vendor: o.vendor || null, status: o.status, eta: officeDate(o.eta, tz) };
      if (o.orderId && project.orders.some((x) => x.id === o.orderId)) {
        await tx.update(orders).set(values).where(eq(orders.id, o.orderId));
      } else {
        await tx.insert(orders).values({ ...values, projectId: project.id });
      }
      changes.push(`Order "${o.item}": ${o.status.toLowerCase().replace("_", " ")}${o.eta ? `, ETA ${o.eta}` : ""}`);
    }
    for (const v of visitChanges) {
      const at = officeDate(v.at, tz);
      if (!at) continue;
      if (v.visitId && project.visits.some((x) => x.id === v.visitId)) {
        await tx.update(visits).set({ title: v.title, at }).where(eq(visits.id, v.visitId));
        changes.push(`Visit moved: ${v.title}, ${v.at.replace("T", " ")}`);
      } else {
        await tx.insert(visits).values({ projectId: project.id, title: v.title, at });
        changes.push(`Visit scheduled: ${v.title}, ${v.at.replace("T", " ")}`);
      }
    }
    for (const n of designNotes) changes.push(`Design: ${n}`);

    if (stageUpdates.length) {
      const pct = await recomputeProjectProgress(tx, project.id);
      if (project.status === "DESIGN" && pct > 0) await tx.update(projects).set({ status: "ACTIVE" }).where(eq(projects.id, project.id));
    }

    const [u] = await tx
      .insert(siteUpdates)
      .values({
        projectId: project.id,
        stageId: stageUpdates[0]?.stageId ?? null,
        authorId: user.id,
        source: data.transcript ? "VOICE" : "MANUAL",
        transcript: data.transcript || null,
        audioUrl: data.audioUrl || null,
        summary: data.summary,
        issues: data.issues.filter(Boolean).join("; ") || null,
        changes,
        clientMessage: data.sendToClient ? data.clientMessage : null,
        sentToClient: false,
      })
      .returning();
    if (data.photos.length) {
      await tx.insert(photos).values(data.photos.map((p) => ({ url: p.url, clientVisible: p.clientVisible, projectId: project.id, updateId: u.id })));
    }
    return u.id;
  });

  let sendStatus: string | null = null;
  if (data.sendToClient && data.clientMessage.trim()) {
    sendStatus = await sendClientUpdate(
      project.client.phone,
      data.clientMessage.trim() + (project.client.portalToken ? `\n\nPhotos and progress: ${appUrl}/portal/${project.client.portalToken}` : ""),
      data.photos.filter((p) => p.clientVisible).map((p) => p.url),
      appUrl,
    );
    await db
      .update(siteUpdates)
      .set({ sentToClient: sendStatus === "sent on WhatsApp", sendStatus, sentAt: new Date() })
      .where(eq(siteUpdates.id, updateId));
  }

  return { ok: true, updateId, projectId: project.id, sendStatus, changes };
}
