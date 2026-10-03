import { notFound } from "next/navigation";
import { date, money } from "@/lib/format";
import { loadProject } from "../../../data";
import { PrintButton } from "./print-button";

export default async function QuotePage({ params }: { params: Promise<{ id: string; quoteId: string }> }) {
  const { id, quoteId } = await params;
  const { project } = await loadProject(id, "boq");
  const quote = project.quotes.find((q) => q.id === quoteId);
  if (!quote) notFound();
  const rooms = [...new Set(quote.lines.map((l) => l.room))];
  const schedule = project.milestones;

  return (
    <>
      <div className="no-print mb-4 flex justify-end">
        <PrintButton />
      </div>
      <article className="card mx-auto max-w-3xl p-6 sm:p-10 print:border-0 print:p-0">
        <header className="mb-8 flex flex-col justify-between gap-4 border-b border-line pb-6 sm:flex-row">
          <div>
            <p className="h-display text-4xl">Zukhti Home</p>
            <p className="text-sm text-muted">Turnkey interiors · {project.office.name}</p>
          </div>
          <div className="text-sm sm:text-right">
            <p className="font-semibold">Quotation v{quote.version}</p>
            <p className="text-muted">{date(quote.createdAt)}</p>
            <p className="text-muted">Ref {project.code}</p>
          </div>
        </header>

        <section className="mb-6 text-sm">
          <p className="label">Prepared for</p>
          <p className="font-semibold">{project.client.name}</p>
          <p className="text-muted">{project.name}</p>
          {project.siteAddress && <p className="text-muted">{project.siteAddress}</p>}
        </section>

        {rooms.map((room) => (
          <section key={room} className="mb-5">
            <h2 className="h-display mb-1 text-xl">{room}</h2>
            <table className="table-clean">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Rate</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {quote.lines
                  .filter((l) => l.room === room)
                  .map((l, i) => (
                    <tr key={i}>
                      <td>{l.description}</td>
                      <td className="whitespace-nowrap text-right">
                        {l.qty} {l.unit}
                      </td>
                      <td className="whitespace-nowrap text-right">{money(l.unitPrice, quote.currency)}</td>
                      <td className="whitespace-nowrap text-right font-semibold">{money(l.amount, quote.currency)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        ))}

        <section className="ml-auto mt-6 w-full max-w-xs text-sm">
          <div className="flex justify-between py-1">
            <span>Subtotal</span>
            <span>{money(quote.subtotal, quote.currency)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span>
              {quote.taxLabel} {quote.taxRate}%
            </span>
            <span>{money(quote.tax, quote.currency)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-ink pt-2 text-base font-bold">
            <span>Total</span>
            <span>{money(quote.total, quote.currency)}</span>
          </div>
        </section>

        {schedule.length > 0 && (
          <section className="mt-8 text-sm">
            <h2 className="h-display mb-1 text-xl">Payment schedule</h2>
            <table className="table-clean">
              <tbody>
                {schedule.map((m) => (
                  <tr key={m.id}>
                    <td>{m.label}</td>
                    <td className="text-right">{m.percent}%</td>
                    <td className="text-right font-semibold">{money((quote.total * m.percent) / 100, quote.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <footer className="mt-10 border-t border-line pt-4 text-xs text-muted">
          Valid for 30 days. Prices include supply and installation unless stated. Final quantities are measured on site.
        </footer>
      </article>
    </>
  );
}
