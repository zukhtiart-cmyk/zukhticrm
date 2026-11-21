import { notFound } from "next/navigation";
import { loadPortalClient, loadPortalProject } from "@/lib/portal-data";
import { getSettings } from "@/lib/settings";
import { quotePdf } from "@/lib/pdf/quote-pdf";
import { pdfResponse } from "@/lib/pdf/respond";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: Promise<{ token: string; quoteId: string }> }) {
  const { token, quoteId } = await params;
  const client = await loadPortalClient(token);
  for (const p of client.projects) {
    const { project } = await loadPortalProject(token, p.id);
    const quote = project?.quotes.find((q) => q.id === quoteId);
    if (project && quote) {
      const { company } = await getSettings();
      const bytes = await quotePdf({ project, quote, schedule: project.milestones, company });
      return pdfResponse(bytes, `${company.name} Quotation ${project.code} v${quote.version}.pdf`, new URL(req.url).searchParams.has("download"));
    }
  }
  notFound();
}
