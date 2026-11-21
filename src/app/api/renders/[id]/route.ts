import { eq } from "drizzle-orm";
import { db, designRenders, designs } from "@/db";
import { assertProjectAccess } from "@/app/(app)/projects/data";
import { pollJob } from "@/lib/meltflex";

/** The gallery checks running jobs here every few seconds. Checking with MeltFlex costs nothing. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await db.query.designRenders.findFirst({ where: eq(designRenders.id, id) });
  if (!r) return Response.json({ status: "missing" }, { status: 404 });
  const d = await db.query.designs.findFirst({ where: eq(designs.id, r.designId), columns: { projectId: true } });
  try {
    await assertProjectAccess(d!.projectId, "projects.view");
  } catch {
    return Response.json({ status: "missing" }, { status: 404 });
  }
  if (r.status !== "working") return Response.json({ status: r.status });
  const age = Date.now() - new Date(r.updatedAt).getTime();
  if (r.poll) {
    try {
      const j = await pollJob(r.poll);
      if (j.status === "ready") await db.update(designRenders).set({ status: "ready", url: j.videoUrl ?? j.viewerUrl ?? null, worldId: j.worldId ?? null, poll: null, updatedAt: new Date() }).where(eq(designRenders.id, id));
      if (j.status === "failed") await db.update(designRenders).set({ status: "failed", error: j.error.slice(0, 300), poll: null, updatedAt: new Date() }).where(eq(designRenders.id, id));
      return Response.json({ status: j.status });
    } catch {
      return Response.json({ status: "working" });
    }
  }
  // A background job that never reported back (e.g. the server was stopped).
  if (age > 8 * 60_000) {
    await db.update(designRenders).set({ status: "failed", error: "It took too long and was stopped. Try again.", updatedAt: new Date() }).where(eq(designRenders.id, id));
    return Response.json({ status: "failed" });
  }
  return Response.json({ status: "working" });
}
