import { get } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { clients, db, projects, users } from "@/db";
import { getSession } from "@/lib/auth";
import { officeScope } from "@/lib/permissions";

/**
 * Serves files from a private Blob store.
 * Paths look like photos/<projectId>/…, designs/<projectId>/…, voice/<projectId>/….
 * Allowed for signed-in staff who can see that project, or a client portal link (?t=) for the same project.
 */
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const pathname = path.map(decodeURIComponent).join("/");
  const [kind, projectId] = path;
  if (!["photos", "designs", "voice"].includes(kind) || !projectId || pathname.includes("..")) return new Response("Not found", { status: 404 });

  let allowed = false;
  const session = await getSession();
  if (session) {
    const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
    if (user?.active) {
      const scope = officeScope(user);
      allowed = !!(await db.query.projects.findFirst({ where: scope ? and(eq(projects.id, projectId), eq(projects.officeId, scope)) : eq(projects.id, projectId), columns: { id: true } }));
    }
  }
  const token = new URL(req.url).searchParams.get("t");
  if (!allowed && token && kind !== "voice") {
    const client = await db.query.clients.findFirst({ where: eq(clients.portalToken, token), columns: { id: true } });
    if (client) allowed = !!(await db.query.projects.findFirst({ where: and(eq(projects.id, projectId), eq(projects.clientId, client.id)), columns: { id: true } }));
  }
  if (!allowed) return new Response("Not found", { status: 404 });

  let result: Awaited<ReturnType<typeof get>>;
  try {
    result = await get(pathname, { access: "private" });
  } catch (e) {
    console.error("files: blob read failed", pathname, e);
    return new Response("File unavailable", { status: 502 });
  }
  if (!result || result.statusCode !== 200) return new Response("Not found", { status: 404 });
  return new Response(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType || "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
