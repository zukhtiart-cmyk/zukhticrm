import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { db, designs, projects } from "@/db";
import { loadPortalClient } from "@/lib/portal-data";
import { normaliseScene } from "@/lib/home-scene";
import { normaliseLook } from "@/lib/themes";
import { Home3D } from "@/components/home3d/home-3d";

export default async function PortalHome3D({ params }: { params: Promise<{ token: string; designId: string }> }) {
  const { token, designId } = await params;
  const client = await loadPortalClient(token);
  const d = await db.query.designs.findFirst({
    where: and(eq(designs.id, designId), ne(designs.status, "DRAFT")),
    columns: { id: true, title: true, room: true, scene: true, render: true, look: true, projectId: true },
  });
  if (!d?.scene) notFound();
  const project = await db.query.projects.findFirst({ where: and(eq(projects.id, d.projectId), eq(projects.clientId, client.id)), columns: { id: true, name: true } });
  if (!project) notFound();
  return (
    <div className="grid gap-3">
      <Link href={`/portal/${token}?p=${project.id}#designs`} className="text-sm font-semibold text-muted">
        ← Back
      </Link>
      <h1 className="text-xl font-bold">
        {d.title} <span className="text-sm font-normal text-muted">· {project.name}</span>
      </h1>
      <Home3D scene={normaliseScene(d.scene)} look={normaliseLook(d.look, d.render?.interiorStyle)} explore />
      <p className="text-xs text-muted">Spin around the dollhouse, or choose Walk through and tap a room. You can try other themes and moods here — your designer&apos;s choice is the one shown first.</p>
    </div>
  );
}
