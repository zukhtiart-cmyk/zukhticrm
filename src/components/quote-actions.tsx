/** Download / open the designed PDF of a quote, plus a plain browser print. */
export function QuoteActions({ pdfHref }: { pdfHref: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <a href={pdfHref} target="_blank" rel="noopener" className="btn-ghost">
        Open PDF
      </a>
      <a href={`${pdfHref}?download=1`} className="btn-primary">
        Download PDF
      </a>
    </div>
  );
}
