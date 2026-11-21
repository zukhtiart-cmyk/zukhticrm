import { date, money, round2 } from "@/lib/format";
import type { QuoteLine, QuoteMeta } from "@/db/schema";
import { amountInWords, normaliseNotes, sectionLetter, type PriceMode, type TaxMode } from "@/lib/quote-setup";

type DocProject = {
  code: string;
  name: string;
  siteAddress: string | null;
  client: { name: string; phone: string; email: string | null };
  office: {
    name: string;
    city: string;
    currency: string;
    taxLabel: string;
    taxRate: number;
  };
};

function Letterhead({
  project,
  title,
  lines,
}: {
  project: DocProject;
  title: string;
  lines: string[];
}) {
  return (
    <>
      <header className="mb-8 flex flex-col justify-between gap-4 border-b border-line pb-6 sm:flex-row">
        <div>
          <p className="h-display text-4xl">Zukhti Home</p>
          <p className="text-sm text-muted">
            Turnkey interiors · {project.office.name}
          </p>
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
        {project.siteAddress && (
          <p className="text-muted">{project.siteAddress}</p>
        )}
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
  quote: {
    version: number;
    createdAt: Date;
    currency: string;
    taxLabel: string;
    taxRate: number;
    subtotal: number;
    tax: number;
    total: number;
    lines: QuoteLine[];
    mode?: string | null;
    meta?: QuoteMeta | null;
  };
  schedule: { id: string; label: string; percent: number }[];
}) {
  const meta = quote.meta ?? null;
  const mode = (quote.mode ?? "itemised") as PriceMode;
  const taxMode = (meta?.taxMode ?? "add") as TaxMode;
  const cur = quote.currency;
  const rooms = [...new Set(quote.lines.map((l) => l.room))];
  const letters = rooms.map((_, i) => sectionLetter(i));
  const notes = meta?.notes ? normaliseNotes(meta.notes) : null;
  const amount = meta?.amount ?? (taxMode === "included" ? quote.total : quote.subtotal);
  const sum = meta?.sum ?? quote.lines.reduce((a, l) => a + l.amount, 0);
  const rs = (n: number) => (cur === "INR" ? `Rs. ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n)}/-` : money(n, cur));
  const words = (n: number) => (cur === "INR" ? `Rs. ${amountInWords(n, cur)} only/-` : `${cur} ${amountInWords(n, cur)} only`);
  const lettersText = letters.length > 3 ? `${letters.slice(0, 3).join("+")}+Etc` : letters.join("+");
  const priced = mode === "itemised";

  return (
    <article className="card mx-auto max-w-3xl p-6 sm:p-10 print:border-0 print:p-0">
      <Letterhead project={project} title={`Quotation v${quote.version}`} lines={[date(quote.createdAt), `Ref ${project.code}`]} />
      {meta?.title && <h1 className="mb-5 text-center text-lg font-bold uppercase tracking-wide">{meta.title}</h1>}

      {rooms.map((room, ri) => {
        const lines = quote.lines.filter((l) => l.room === room);
        const size = meta?.roomSizes?.[room];
        const roomSum = lines.reduce((a, l) => a + l.amount, 0);
        return (
          <section key={room} className="mb-5 break-inside-avoid-page">
            <h2 className="mb-1 flex items-baseline gap-2 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-wide">
              <span>{letters[ri]}</span>
              <span>
                {room}
                {size ? ` (${size})` : ""}
              </span>
            </h2>
            <div className="overflow-x-auto">
              <table className="table-clean text-sm">
                <thead>
                  <tr>
                    <th className="w-14">Sr. no</th>
                    <th>Description of item &amp; work offered</th>
                    {priced && (
                      <>
                        <th className="text-right">Qty</th>
                        <th className="text-right">Rate</th>
                        <th className="text-right">Amount</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td className="align-top">{i + 1}</td>
                      <td className="align-top">
                        {l.title ? <b className="uppercase">{l.title}</b> : null}
                        {l.title && l.description && l.description !== l.title ? " – " : ""}
                        {l.description !== l.title ? l.description : ""}
                        {l.size ? ` (${l.size})` : ""}
                      </td>
                      {priced && (
                        <>
                          <td className="whitespace-nowrap text-right align-top">
                            {l.qty} {l.unit}
                          </td>
                          <td className="whitespace-nowrap text-right align-top">{money(l.unitPrice, cur)}</td>
                          <td className="whitespace-nowrap text-right align-top font-semibold">{money(l.amount, cur)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                  {mode === "rooms" && (
                    <tr>
                      <td />
                      <td className="text-right font-semibold">
                        Total ({letters[ri]}): {money(roomSum, cur)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <section className="mt-6 grid gap-1 border-y-2 border-ink py-3 text-sm">
        {priced && Math.round(sum) !== Math.round(amount) && (
          <p className="flex justify-between">
            <span>Items total</span>
            <span>{money(sum, cur)}</span>
          </p>
        )}
        <p className="flex justify-between gap-4 font-bold">
          <span>
            Total amount of above interior work ({lettersText})
            {taxMode === "included" ? `, inclusive of ${quote.taxLabel} ${quote.taxRate}%` : ""}:
          </span>
          <span className="whitespace-nowrap">{rs(amount)}</span>
        </p>
        {taxMode === "add" && quote.tax > 0 && (
          <>
            <p className="flex justify-between">
              <span>
                {quote.taxLabel} {quote.taxRate}%
              </span>
              <span>{rs(quote.tax)}</span>
            </p>
            <p className="flex justify-between font-bold">
              <span>Grand total</span>
              <span>{rs(quote.total)}</span>
            </p>
          </>
        )}
        <p className="mt-1">
          <span className="font-semibold">Total amount in words: </span>
          {words(quote.total)}
        </p>
      </section>

      {notes ? (
        <section className="mt-6 grid gap-4 text-sm">
          {notes.rates.length > 0 && (
            <div className="break-inside-avoid">
              <h3 className="mb-1 font-bold uppercase">Note</h3>
              <table className="table-clean text-sm">
                <tbody>
                  {notes.rates.map((r, i) => {
                    const m = r.match(/^([^:]{2,60}):\s*(.+)$/);
                    return (
                      <tr key={i}>
                        {m ? (
                          <>
                            <td className="font-semibold">{m[1]}</td>
                            <td>{m[2]}</td>
                          </>
                        ) : (
                          <td colSpan={2}>{r}</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {notes.budgetNote && (
            <p>
              <b>NOTE:</b> {notes.budgetNote}
            </p>
          )}
          {notes.brands.length > 0 && (
            <div className="break-inside-avoid">
              <h3 className="mb-1 font-bold uppercase">Brand or quality materials</h3>
              <ol className="list-decimal space-y-0.5 pl-5">
                {notes.brands.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
                {notes.exclusions.map((b, i) => (
                  <li key={`x${i}`}>{b}</li>
                ))}
              </ol>
            </div>
          )}
          {!notes.brands.length && notes.exclusions.length > 0 && (
            <div>
              <h3 className="mb-1 font-bold uppercase">Not included</h3>
              <ul className="list-disc pl-5">
                {notes.exclusions.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          {notes.packages.length > 0 && (
            <div className="break-inside-avoid">
              <h3 className="mb-1 font-bold uppercase">Other suggested packages</h3>
              <ol className="space-y-0.5">
                {notes.packages.map((b, i) => (
                  <li key={i}>
                    <b>{String.fromCharCode(65 + i)})</b> {b}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      ) : null}

      {schedule.length > 0 && (
        <section className="mt-8 text-sm break-inside-avoid">
          <h2 className="mb-1 font-bold uppercase">Payment schedule</h2>
          <table className="table-clean">
            <tbody>
              {schedule.map((m) => (
                <tr key={m.id}>
                  <td>{m.label}</td>
                  <td className="text-right">{m.percent}%</td>
                  <td className="text-right font-semibold">{money((quote.total * m.percent) / 100, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <footer className="mt-10 border-t border-line pt-4 text-xs text-muted">
        {notes ? notes.terms : "Valid for 30 days. Prices include supply and installation unless stated. Final quantities are measured on site."}
        {notes && <p className="mt-4 text-center text-sm font-bold tracking-widest text-ink">THANK YOU</p>}
      </footer>
    </article>
  );
}

/** Milestone amounts include tax; the invoice shows the taxable value and tax separately. */
export function InvoiceDocument({
  project,
  milestone,
}: {
  project: DocProject;
  milestone: {
    label: string;
    percent: number;
    amount: number;
    status: string;
    invoiceNumber: string | null;
    invoicedAt: Date | null;
    paidAmount: number | null;
    paidAt: Date | null;
    reference: string | null;
  };
}) {
  const { currency, taxLabel, taxRate } = project.office;
  const total =
    milestone.status === "PAID"
      ? (milestone.paidAmount ?? milestone.amount)
      : milestone.amount;
  const taxable = round2(total / (1 + taxRate / 100));
  const tax = round2(total - taxable);
  return (
    <article className="card mx-auto max-w-3xl p-6 sm:p-10 print:border-0 print:p-0">
      <Letterhead
        project={project}
        title={
          milestone.status === "PAID" ? "Tax invoice · Paid" : "Tax invoice"
        }
        lines={[
          milestone.invoiceNumber ?? "",
          date(milestone.invoicedAt),
          `Ref ${project.code}`,
        ].filter(Boolean)}
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
            <td className="whitespace-nowrap text-right font-semibold">
              {money(taxable, currency)}
            </td>
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
        <p className="mt-6 rounded-xl bg-brass-soft px-4 py-3 text-sm text-brass">
          Payment due. Please contact your project manager for bank details.
        </p>
      )}
      <footer className="mt-10 border-t border-line pt-4 text-xs text-muted">
        This is a computer-generated invoice.
      </footer>
    </article>
  );
}

function Totals({
  currency,
  rows,
  total,
}: {
  currency: string;
  rows: [string, number][];
  total: number;
}) {
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
