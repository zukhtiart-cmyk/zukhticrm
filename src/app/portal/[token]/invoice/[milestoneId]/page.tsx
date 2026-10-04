import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceDocument } from "@/components/documents";
import { PrintButton } from "@/components/print-button";
import { loadPortalClient, loadPortalProject } from "@/lib/portal-data";

export default async function PortalInvoice({
  params,
}: {
  params: Promise<{ token: string; milestoneId: string }>;
}) {
  const { token, milestoneId } = await params;
  const client = await loadPortalClient(token);
  for (const p of client.projects) {
    const { project } = await loadPortalProject(token, p.id);
    const milestone = project?.milestones.find(
      (m) => m.id === milestoneId && m.invoiceNumber,
    );
    if (project && milestone) {
      return (
        <>
          <div className="no-print mb-4 flex items-center justify-between">
            <Link
              href={`/portal/${token}?p=${project.id}#documents`}
              className="text-sm font-semibold text-muted"
            >
              ← Back
            </Link>
            <PrintButton />
          </div>
          <InvoiceDocument project={project} milestone={milestone} />
        </>
      );
    }
  }
  notFound();
}
