import { can } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { InvoiceDocument } from "@/components/documents";
import { PrintButton } from "@/components/print-button";
import { loadProject } from "../../../data";

export default async function InvoicePage({ params }: { params: Promise<{ id: string; milestoneId: string }> }) {
  const { id, milestoneId } = await params;
  const { user, project } = await loadProject(id);
  if (!can(user.role, "payments") && !can(user.role, "boq")) notFound();
  const milestone = project.milestones.find((m) => m.id === milestoneId && m.invoiceNumber);
  if (!milestone) notFound();
  return (
    <>
      <div className="no-print mb-4 flex justify-end">
        <PrintButton />
      </div>
      <InvoiceDocument project={project} milestone={milestone} />
    </>
  );
}
