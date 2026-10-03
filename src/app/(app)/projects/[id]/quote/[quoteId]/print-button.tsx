"use client";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="btn-primary">
      Download PDF / Print
    </button>
  );
}
