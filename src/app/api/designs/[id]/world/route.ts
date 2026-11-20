import { eq } from "drizzle-orm";
import { db, designs } from "@/db";
import { assertProjectAccess } from "@/app/(app)/projects/data";
import { checkWorld } from "@/lib/render3d";

/** Polled by the Designs tab while a walk-through builds. Checking is free on MeltFlex. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await db.query.designs.findFirst({ where: eq(designs.id, id) });
  if (!d) return Response.json({ status: "missing" }, { status: 404 });
  try {
    await assertProjectAccess(d.projectId, "design");
  } catch {
    return Response.json({ status: "missing" }, { status: 404 });
  }
  if (d.worldId) return Response.json({ status: "ready" });
  if (d.worldStatus !== "building" || !d.worldOperation) return Response.json({ status: d.worldStatus ?? "none" });
  try {
    const w = await checkWorld(d.worldOperation);
    if (w.status === "ready") await db.update(designs).set({ worldId: w.worldId, worldStatus: "ready" }).where(eq(designs.id, id));
    if (w.status === "failed") await db.update(designs).set({ worldStatus: `failed: ${w.error}`.slice(0, 300) }).where(eq(designs.id, id));
    return Response.json({ status: w.status });
  } catch (e) {
    return Response.json({ status: "building", note: (e as Error).message });
  }
}
