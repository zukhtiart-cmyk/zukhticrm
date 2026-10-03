import { notFound } from "next/navigation";
import { QuoteDocument } from "@/components/documents";
import { PrintButton } from "@/components/print-button";
import { loadProject } from "../../../data";

export default async function QuotePage({ params }: { params: Promise<{ id: string; quoteId: string }> }) {
  const { id, quoteId } = await params;
  const { project } = await loadProject(id, "boq");
  const quote = project.quotes.find((q) => q.id === quoteId);
  if (!quote) notFound();
  return (
    <>
      <div className="no-print mb-4 flex justify-end">
        <PrintButton />
      </div>
      <QuoteDocument project={project} quote={quote} schedule={project.milestones} />
    </>
  );
}
