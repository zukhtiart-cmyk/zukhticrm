import Link from "next/link";
import { notFound } from "next/navigation";
import { QuoteDocument } from "@/components/documents";
import { PrintButton } from "@/components/print-button";
import { loadPortalClient, loadPortalProject } from "@/lib/portal-data";

export default async function PortalQuote({
  params,
}: {
  params: Promise<{ token: string; quoteId: string }>;
}) {
  const { token, quoteId } = await params;
  const client = await loadPortalClient(token);
  for (const p of client.projects) {
    const { project } = await loadPortalProject(token, p.id);
    const quote = project?.quotes.find((q) => q.id === quoteId);
    if (project && quote) {
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
          <QuoteDocument
            project={project}
            quote={quote}
            schedule={project.milestones}
          />
        </>
      );
    }
  }
  notFound();
}
