import Link from "next/link";
import { can } from "@/lib/permissions";
import { date } from "@/lib/format";
import { PageHeader, ProgressBar, StatusBadge } from "@/components/ui";
import { loadProject } from "../data";
import { ProjectTabs } from "./tabs";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, project } = await loadProject(id);
  const tabs = [
    { slug: "", label: "Overview" },
    { slug: "designs", label: "Designs" },
    ...(can(user.role, "boq") ? [{ slug: "boq", label: "BOQ & quotes" }] : []),
    ...(can(user.role, "payments") || can(user.role, "boq") ? [{ slug: "payments", label: "Payments" }] : []),
    { slug: "orders", label: "Orders" },
  ];
  return (
    <>
      <div className="no-print">
        <PageHeader
          title={project.name}
          back={{ href: "/projects", label: "Projects" }}
          subtitle={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <StatusBadge status={project.status} />
              <span>{project.code}</span>
              <span>{project.client.name}</span>
              <span>{project.office.name}</span>
              <span>Handover {date(project.expectedHandover)}</span>
            </span>
          }
          actions={
            <Link href={`/desk?project=${project.id}`} className="btn-brass">
              Voice update
            </Link>
          }
        />
        <div className="mb-5 flex items-center gap-3">
          <ProgressBar value={project.progress} />
          <span className="text-sm font-semibold">{project.progress}%</span>
        </div>
      </div>
      <ProjectTabs id={project.id} tabs={tabs} />
      {children}
    </>
  );
}
