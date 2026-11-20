import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { db, designs, projects } from "@/db";
import { loadPortalClient } from "@/lib/portal-data";
import { INTERIOR_STYLES, type InteriorStyle } from "@/lib/home-scene";
import { Home3D } from "@/components/home3d/home-3d";

export default async function PortalHome3D({ params }: { params: Promise<{ token: string; designId: string }> }) {
  const { token, designId } = await params;
  const client = await loadPortalClient(token);
  const d = await db.query.designs.findFirst({
    where: and(eq(designs.id, designId), ne(designs.status, "DRAFT")),
    columns: { id: true, title: true, room: true, scene: true, render: true, projectId: true },
  });
  if (!d?.scene) notFound();
  const project = await db.query.projects.findFirst({ where: and(eq(projects.id, d.projectId), eq(projects.clientId, client.id)), columns: { id: true, name: true } });
  if (!project) notFound();
  const style = ((INTERIOR_STYLES as readonly string[]).includes(d.render?.interiorStyle ?? "") ? d.render!.interiorStyle : "modern") as InteriorStyle;
  return (
    <div className="grid gap-3">
      <Link href={`/portal/${token}?p=${project.id}#designs`} className="text-sm font-semibold text-muted">
        ← Back
      </Link>
      <h1 className="text-xl font-bold">
        {d.title} <span className="text-sm font-normal text-muted">· {project.name}</span>
      </h1>
      <Home3D scene={d.scene} style={style} canChangeStyle />
      <p className="text-xs text-muted">Spin around the dollhouse, or choose Walk through and tap a room. You can try other styles here — your designer&apos;s choice is the one shown first.</p>
    </div>
  );
}
