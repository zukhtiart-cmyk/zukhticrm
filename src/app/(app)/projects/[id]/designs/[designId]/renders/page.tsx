import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, designRenders, designs } from "@/db";
import { can } from "@/lib/permissions";
import { normaliseScene } from "@/lib/home-scene";
import { normaliseLook } from "@/lib/themes";
import { renderPrompt } from "@/lib/render-prompt";
import { CREDITS, meltflexReady } from "@/lib/meltflex";
import { assertProjectAccess } from "../../../../data";
import { RendersGallery } from "./gallery";

export const maxDuration = 300;

export default async function RendersPage({ params, searchParams }: { params: Promise<{ id: string; designId: string }>; searchParams: Promise<{ shot?: string }> }) {
  const { id, designId } = await params;
  const { shot: focus } = await searchParams;
  const { user, project } = await assertProjectAccess(id, "projects.view");
  const d = await db.query.designs.findFirst({ where: and(eq(designs.id, designId), eq(designs.projectId, project.id)) });
  if (!d?.scene) notFound();
  const scene = normaliseScene(d.scene);
  const look = normaliseLook(d.look, d.render?.interiorStyle);
  const renders = await db.query.designRenders.findMany({ where: eq(designRenders.designId, d.id), orderBy: desc(designRenders.createdAt) });
  const shots = look.shots.map((s) => ({ ...s, prompt: renderPrompt(scene, look, s) }));
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href={`/projects/${project.id}/designs/${d.id}/3d`} className="text-xs font-semibold text-muted hover:text-brass">
            ← Design studio
          </Link>
          <h2 className="text-lg font-bold">
            Photo-real · {d.title} <span className="text-sm font-normal text-muted">v{d.version}</span>
          </h2>
          <p className="text-sm text-muted">Each saved view becomes a photo-real picture. From a picture you can make a short video or an explorable walk-through. Star the best ones to show the client.</p>
        </div>
        <p className="text-xs text-muted">
          Credits: picture {CREDITS.photo.quick} (lite {CREDITS.photo.lite}, pro {CREDITS.photo.pro}) · video {CREDITS.video[4]}–{CREDITS.video[8]} · walk-through {CREDITS.world}
        </p>
      </div>
      {!meltflexReady() && (
        <p className="rounded-xl bg-brass-soft px-3 py-2 text-sm">
          Turn this on by adding <code>MELTFLEX_API_KEY</code> (from meltflexai.com/settings) in Vercel → Settings → Environment Variables, then redeploy.
        </p>
      )}
      {!shots.length && (
        <p className="rounded-xl border border-dashed border-line bg-paper p-4 text-sm text-muted">
          No saved views yet. In the{" "}
          <Link href={`/projects/${project.id}/designs/${d.id}/3d`} className="underline">
            design studio
          </Link>
          , frame a view and use Shots → 📷 Save this view.
        </p>
      )}
      <RendersGallery
        projectId={project.id}
        designId={d.id}
        shots={shots}
        focus={focus}
        canEdit={can(user.role, "design")}
        renders={renders.map((r) => ({ id: r.id, shotId: r.shotId, parentId: r.parentId, kind: r.kind, status: r.status, url: r.url, error: r.error, chosen: r.chosen, prompt: r.prompt }))}
      />
    </div>
  );
}
