import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, designs } from "@/db";
import { normaliseScene } from "@/lib/home-scene";
import { DesignStatusBadge } from "@/components/design-bits";
import { assertProjectAccess } from "../../../../data";
import { PlanCheck } from "./client";

export default async function PlanCheckPage({ params, searchParams }: { params: Promise<{ id: string; designId: string }>; searchParams: Promise<{ new?: string }> }) {
  const { id, designId } = await params;
  const { new: isNew } = await searchParams;
  const { project } = await assertProjectAccess(id, "design");
  const d = await db.query.designs.findFirst({ where: and(eq(designs.id, designId), eq(designs.projectId, project.id)) });
  if (!d?.scene) notFound();
  const scene = normaliseScene(d.scene);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href={`/projects/${project.id}/designs`} className="text-xs font-semibold text-muted hover:text-brass">
            ← Designs
          </Link>
          <h2 className="text-lg font-bold">
            Check plan · {d.title} <span className="text-sm font-normal text-muted">v{d.version}</span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <DesignStatusBadge status={d.status} />
          <Link href={`/projects/${project.id}/designs/${d.id}/3d`} className="btn-ghost px-3 py-1.5 text-xs">
            View 3D
          </Link>
        </div>
      </div>
      {isNew && (
        <p className="rounded-xl bg-olive-soft px-3 py-2 text-sm text-olive">
          Claude has traced {scene.walls.length} walls, {scene.openings.length} doors &amp; windows and {scene.rooms.length} rooms. Check them against your plan — remove walls where it&apos;s open, fix anything misplaced — then build the 3D.
        </p>
      )}
      {d.status !== "DRAFT" && <p className="rounded-xl bg-brass-soft px-3 py-2 text-sm">This design is with the client. Saving changes makes a new draft version; the client&apos;s copy stays as it is.</p>}
      <PlanCheck projectId={project.id} designId={d.id} scene={scene} />
      {scene.notes.length > 0 && (
        <details className="text-sm text-muted">
          <summary className="cursor-pointer font-semibold">Notes from the plan reader ({scene.notes.length})</summary>
          <ul className="mt-1 list-disc pl-5">
            {scene.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
