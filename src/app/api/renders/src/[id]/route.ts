import { eq } from "drizzle-orm";
import { db, designRenders } from "@/db";
import { checkSource } from "@/lib/render-sign";
import { readStoredFile } from "@/lib/storage";

/** One photo-real picture, for MeltFlex to fetch when making a video. Only with a valid short-lived signature. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = new URL(req.url);
  if (!checkSource(id, u.searchParams.get("exp"), u.searchParams.get("sig"))) return new Response("Not found", { status: 404 });
  const r = await db.query.designRenders.findFirst({ where: eq(designRenders.id, id), columns: { url: true, kind: true } });
  if (!r?.url || r.kind !== "photo") return new Response("Not found", { status: 404 });
  const f = await readStoredFile(r.url);
  return new Response(new Uint8Array(f.bytes), { headers: { "Content-Type": f.type, "Cache-Control": "private, max-age=600" } });
}
