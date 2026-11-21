import { notFound } from "next/navigation";
import { loadProject } from "../../../../data";
import { getSettings } from "@/lib/settings";
import { quotePdf } from "@/lib/pdf/quote-pdf";
import { pdfResponse } from "@/lib/pdf/respond";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: Promise<{ id: string; quoteId: string }> }) {
  const { id, quoteId } = await params;
  const { project } = await loadProject(id, "boq");
  const quote = project.quotes.find((q) => q.id === quoteId);
  if (!quote) notFound();
  const { company } = await getSettings();
  const bytes = await quotePdf({ project, quote, schedule: project.milestones, company });
  return pdfResponse(bytes, `${company.name} Quotation ${project.code} v${quote.version}.pdf`, new URL(req.url).searchParams.has("download"));
}
