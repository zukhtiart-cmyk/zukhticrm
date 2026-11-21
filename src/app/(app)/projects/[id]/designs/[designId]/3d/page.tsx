import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { desc } from "drizzle-orm";
import { db, designs, designThemes } from "@/db";
import { can } from "@/lib/permissions";
import { normaliseScene } from "@/lib/home-scene";
import { cleanTheme, normaliseLook, MOODS, lookTheme } from "@/lib/themes";
import { DesignStatusBadge } from "@/components/design-bits";
import { assertProjectAccess } from "../../../../data";
import { shareDesign } from "../../../../design-actions";
import { Studio } from "@/components/studio/studio";

// Reading Pinterest pictures and mood boards with Claude can take a little while.
export const maxDuration = 120;

export default async function Design3DPage({ params, searchParams }: { params: Promise<{ id: string; designId: string }>; searchParams: Promise<{ new?: string }> }) {
  const { id, designId } = await params;
  const { new: isNew } = await searchParams;
  const { user, project } = await assertProjectAccess(id, "projects.view");
  const d = await db.query.designs.findFirst({ where: and(eq(designs.id, designId), eq(designs.projectId, project.id)) });
  if (!d?.scene) notFound();
  const scene = normaliseScene(d.scene);
  const edit = can(user.role, "design");
  const look = normaliseLook(d.look, d.render?.interiorStyle);
  const library = edit ? (await db.query.designThemes.findMany({ orderBy: desc(designThemes.createdAt), limit: 60 })).map((t) => cleanTheme({ ...t.theme, id: `custom:${t.id}`, label: t.name })) : [];

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
          {edit && (
            <Link href={`/projects/${project.id}/designs/${d.id}/plan`} className="btn-ghost px-3 py-1.5 text-xs">
              Edit plan
            </Link>
          )}
          {edit && d.status === "DRAFT" && (
            <form action={shareDesign}>
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="id" value={d.id} />
              <button className="btn-brass px-3 py-1.5 text-xs">Share with client</button>
            </form>
          )}
        </div>
      </div>
      {isNew && <p className="rounded-xl bg-olive-soft px-3 py-2 text-sm text-olive">Your 3D home is ready — {scene.rooms.length} rooms. Tap a room name to walk in.</p>}
      <p className="text-xs text-muted">
        {lookTheme(look).label} · {MOODS[look.mood].label}
        {Object.keys(look.rooms).length ? ` · ${Object.keys(look.rooms).length} room${Object.keys(look.rooms).length > 1 ? "s" : ""} styled` : ""}
        {d.status !== "DRAFT" && edit ? " · This design is with the client — saving changes makes a new draft version." : ""}
      </p>
      <Studio projectId={project.id} designId={d.id} scene={scene} initialLook={look} library={library} canEdit={edit} needsSnapshot={!d.render?.snapshot} />
      {scene.notes.length > 0 && (
        <details className="text-sm text-muted">
          <summary className="cursor-pointer font-semibold">What the plan reader assumed ({scene.notes.length})</summary>
          <ul className="mt-1 list-disc pl-5">
            {scene.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-xs text-muted">Sizes come from the plan and furniture is placed automatically, so treat it as a concept model. A wall or door wrong? Use Edit plan to fix it on top of your plan.</p>
    </div>
  );
}
