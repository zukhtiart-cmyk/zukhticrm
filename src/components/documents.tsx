import { date, money, round2 } from "@/lib/format";
import type { QuoteLine } from "@/db/schema";

type DocProject = {
  code: string;
  name: string;
  siteAddress: string | null;
  client: { name: string; phone: string; email: string | null };
  office: { name: string; city: string; currency: string; taxLabel: string; taxRate: number };
};

function Letterhead({ project, title, lines }: { project: DocProject; title: string; lines: string[] }) {
  return (
    <>
      <header className="mb-8 flex flex-col justify-between gap-4 border-b border-line pb-6 sm:flex-row">
        <div>
          <p className="h-display text-4xl">Zukhti Home</p>
          <p className="text-sm text-muted">Turnkey interiors · {project.office.name}</p>
        </div>
        <div className="text-sm sm:text-right">
          <p className="font-semibold">{title}</p>
          {lines.map((l) => (
            <p key={l} className="text-muted">
              {l}
            </p>
          ))}
        </div>
      </header>
      <section className="mb-6 text-sm">
        <p className="label">Prepared for</p>
        <p className="font-semibold">{project.client.name}</p>
        <p className="text-muted">{project.name}</p>
        {project.siteAddress && <p className="text-muted">{project.siteAddress}</p>}
      </section>
    </>
  );
}

export function QuoteDocument({
  project,
  quote,
  schedule,
}: {
  project: DocProject;
  quote: { version: number; createdAt: Date; currency: string; taxLabel: string; taxRate: number; subtotal: number; tax: number; total: number; lines: QuoteLine[] };
  schedule: { id: string; label: string; percent: number }[];
}) {
  const rooms = [...new Set(quote.lines.map((l) => l.room))];
  return (
    <article className="card mx-auto max-w-3xl p-6 sm:p-10 print:border-0 print:p-0">
      <Letterhead project={project} title={`Quotation v${quote.version}`} lines={[date(quote.createdAt), `Ref ${project.code}`]} />
      {rooms.map((room) => (
        <section key={room} className="mb-5">
          <h2 className="h-display mb-1 text-xl">{room}</h2>
          <div className="overflow-x-auto">
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
          </div>
        </section>
      ))}
      <Totals
        currency={quote.currency}
        rows={[
          ["Subtotal", quote.subtotal],
          [`${quote.taxLabel} ${quote.taxRate}%`, quote.tax],
        ]}
        total={quote.total}
      />
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
      <footer className="mt-10 border-t border-line pt-4 text-xs text-muted">Valid for 30 days. Prices include supply and installation unless stated. Final quantities are measured on site.</footer>
    </article>
  );
}

/** Milestone amounts include tax; the invoice shows the taxable value and tax separately. */
export function InvoiceDocument({
  project,
  milestone,
}: {
  project: DocProject;
  milestone: { label: string; percent: number; amount: number; status: string; invoiceNumber: string | null; invoicedAt: Date | null; paidAmount: number | null; paidAt: Date | null; reference: string | null };
}) {
  const { currency, taxLabel, taxRate } = project.office;
  const total = milestone.status === "PAID" ? (milestone.paidAmount ?? milestone.amount) : milestone.amount;
  const taxable = round2(total / (1 + taxRate / 100));
  const tax = round2(total - taxable);
  return (
    <article className="card mx-auto max-w-3xl p-6 sm:p-10 print:border-0 print:p-0">
      <Letterhead
        project={project}
        title={milestone.status === "PAID" ? "Tax invoice · Paid" : "Tax invoice"}
        lines={[milestone.invoiceNumber ?? "", date(milestone.invoicedAt), `Ref ${project.code}`].filter(Boolean)}
      />
      <table className="table-clean">
        <thead>
          <tr>
            <th>Description</th>
            <th className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              {milestone.label} — {milestone.percent}% of contract value
              <p className="text-xs text-muted">{project.name}</p>
            </td>
            <td className="whitespace-nowrap text-right font-semibold">{money(taxable, currency)}</td>
          </tr>
        </tbody>
      </table>
      <Totals
        currency={currency}
        rows={[
          ["Taxable value", taxable],
          [`${taxLabel} ${taxRate}%`, tax],
        ]}
        total={total}
      />
      {milestone.status === "PAID" ? (
        <p className="mt-6 rounded-xl bg-olive-soft px-4 py-3 text-sm text-olive">
          Received with thanks on {date(milestone.paidAt)}
          {milestone.reference ? ` (${milestone.reference})` : ""}.
        </p>
      ) : (
        <p className="mt-6 rounded-xl bg-brass-soft px-4 py-3 text-sm text-brass">Payment due. Please contact your project manager for bank details.</p>
      )}
      <footer className="mt-10 border-t border-line pt-4 text-xs text-muted">This is a computer-generated invoice.</footer>
    </article>
  );
}

function Totals({ currency, rows, total }: { currency: string; rows: [string, number][]; total: number }) {
  return (
    <section className="ml-auto mt-6 w-full max-w-xs text-sm">
      {rows.map(([label, v]) => (
        <div key={label} className="flex justify-between py-1">
          <span>{label}</span>
          <span>{money(v, currency)}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between border-t border-ink pt-2 text-base font-bold">
        <span>Total</span>
        <span>{money(total, currency)}</span>
      </div>
    </section>
  );
}
