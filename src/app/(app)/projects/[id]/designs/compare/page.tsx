import Link from "next/link";
import { DesignStatusBadge, DesignThumb } from "@/components/design-bits";
import { Empty } from "@/components/ui";
import { normaliseLook, lookTheme, MOODS } from "@/lib/themes";
import { loadProject } from "../../../data";

/** All 3D-home options of a project side by side (latest version of each). */
export default async function CompareOptions({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await loadProject(id);
  const latest = new Map<string, (typeof project.designs)[number]>();
  for (const d of project.designs) {
    if (!d.scene) continue;
    const k = `${d.room}|${d.title}`;
    if (!latest.has(k)) latest.set(k, d); // designs come newest first
  }
  const options = [...latest.values()];
  return (
    <div className="grid gap-4">
      <div>
        <Link href={`/projects/${project.id}/designs`} className="text-xs font-semibold text-muted hover:text-brass">
          ← Designs
        </Link>
        <h2 className="text-lg font-bold">Compare design options</h2>
        <p className="text-sm text-muted">The latest version of each 3D home, side by side. Share the ones you like — the client approves in their portal.</p>
      </div>
      {!options.length && <Empty>No 3D homes yet.</Empty>}
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {options.map((d) => {
          const look = normaliseLook(d.look, d.render?.interiorStyle);
          const theme = lookTheme(look);
          return (
            <div key={d.id} className="grid content-start gap-2 rounded-2xl border border-line bg-paper p-3">
              <DesignThumb url={d.fileUrl} type={d.fileType} title={d.title} />
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {d.title} <span className="text-xs font-normal text-muted">v{d.version}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {theme.label} · {MOODS[look.mood].label}
                    {Object.keys(look.rooms).length ? ` · ${Object.keys(look.rooms).length} room${Object.keys(look.rooms).length > 1 ? "s" : ""} styled` : ""}
                  </p>
                </div>
                <DesignStatusBadge status={d.status} />
              </div>
              <div className="flex h-5 overflow-hidden rounded-md border border-line">
                {[theme.floor.base, theme.wall, theme.fabric, theme.fabricAlt, theme.accent, theme.wood].map((c, i) => (
                  <span key={i} className="flex-1" style={{ background: c }} />
                ))}
              </div>
              {look.shots.length > 0 && (
                <div className="grid grid-cols-3 gap-1">
                  {look.shots.slice(0, 6).map((s) =>
                    s.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={s.id} src={s.url} alt={s.name} title={s.name} className="aspect-[16/10] w-full rounded object-cover" />
                    ) : null,
                  )}
                </div>
              )}
              {d.clientComment && <p className="rounded-lg bg-clay-soft px-2 py-1 text-xs text-clay">Client: “{d.clientComment}”</p>}
              <Link href={`/projects/${project.id}/designs/${d.id}/3d`} className="btn-brass w-fit px-3 py-1.5 text-xs">
                Open in studio →
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
