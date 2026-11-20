import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, designs } from "@/db";
import { can } from "@/lib/permissions";
import { INTERIOR_STYLES, type InteriorStyle } from "@/lib/home-scene";
import { DesignStatusBadge } from "@/components/design-bits";
import { assertProjectAccess } from "../../../../data";
import { shareDesign } from "../../../../design-actions";
import { StaffHome3D } from "./client";

export default async function Design3DPage({ params, searchParams }: { params: Promise<{ id: string; designId: string }>; searchParams: Promise<{ new?: string }> }) {
  const { id, designId } = await params;
  const { new: isNew } = await searchParams;
  const { user, project } = await assertProjectAccess(id, "projects.view");
  const d = await db.query.designs.findFirst({ where: and(eq(designs.id, designId), eq(designs.projectId, project.id)) });
  if (!d?.scene) notFound();
  const edit = can(user.role, "design");
  const style = ((INTERIOR_STYLES as readonly string[]).includes(d.render?.interiorStyle ?? "") ? d.render!.interiorStyle : "modern") as InteriorStyle;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href={`/projects/${project.id}/designs`} className="text-xs font-semibold text-muted hover:text-brass">
            ← Designs
          </Link>
          <h2 className="text-lg font-bold">
            {d.title} <span className="text-sm font-normal text-muted">· {d.room} · v{d.version}</span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <DesignStatusBadge status={d.status} />
          {edit && d.status === "DRAFT" && (
            <form action={shareDesign}>
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="id" value={d.id} />
              <button className="btn-brass px-3 py-1.5 text-xs">Share with client</button>
            </form>
          )}
        </div>
      </div>
      {isNew && <p className="rounded-xl bg-olive-soft px-3 py-2 text-sm text-olive">Your 3D home is ready — {d.scene.rooms.length} spaces read from the plan. Tap a room name to walk in.</p>}
      <StaffHome3D projectId={project.id} designId={d.id} scene={d.scene} style={style} canEdit={edit && d.status === "DRAFT"} needsSnapshot={!d.render?.snapshot} />
      {d.scene.notes.length > 0 && (
        <details className="text-sm text-muted">
          <summary className="cursor-pointer font-semibold">What the plan reader assumed ({d.scene.notes.length})</summary>
          <ul className="mt-1 list-disc pl-5">
            {d.scene.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-xs text-muted">Sizes come from the plan and furniture is placed automatically, so treat it as a concept model. Plan unclear? Add a note and build it again — same room and title saves a new version.</p>
    </div>
  );
}
