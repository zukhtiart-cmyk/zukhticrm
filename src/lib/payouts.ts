import "server-only";
import { asc, eq } from "drizzle-orm";
import { contractorPayments, db, workOrders } from "@/db";
import { round2 } from "./format";
import { sendTemplate, sendText, templateConfigured, whatsappConfigured } from "./whatsapp";

export type LedgerLine = {
  at: Date;
  kind: "BILL_APPROVED" | "PAYMENT";
  label: string;
  project: string | null;
  /** + we owe them, − we paid them */
  change: number;
  paid: number;
  currency: string;
  balance: number;
  reference?: string | null;
  mode?: string | null;
  receiptUrl?: string | null;
  by?: string | null;
};

/**
 * Running account for one contractor or labourer.
 * Approved bills add to what we owe; advances and bill payments reduce it.
 * Wages and other one-off payments are settled on the spot, so they show as paid without changing the balance.
 * Balance > 0: we owe them. Balance < 0: they hold an advance.
 */
export async function contractorLedger(contractorId: string, projectIds?: Set<string>) {
  const [wos, pays] = await Promise.all([
    db.query.workOrders.findMany({ where: eq(workOrders.contractorId, contractorId), with: { bills: true, project: true } }),
    db.query.contractorPayments.findMany({ where: eq(contractorPayments.contractorId, contractorId), with: { project: true, paidBy: true, workOrder: true }, orderBy: asc(contractorPayments.paidOn) }),
  ]);
  const inScope = (pid: string | null) => !projectIds || (pid !== null && projectIds.has(pid));
  const events: Omit<LedgerLine, "balance">[] = [];
  for (const w of wos.filter((w) => inScope(w.projectId))) {
    for (const b of w.bills.filter((b) => b.status === "APPROVED" || b.status === "PAID")) {
      events.push({ at: b.reviewedAt ?? b.createdAt, kind: "BILL_APPROVED", label: `Bill approved · ${w.number}${b.note ? ` · ${b.note}` : ""}`, project: w.project.name, change: b.amount, paid: 0, currency: w.currency });
    }
  }
  for (const p of pays.filter((p) => inScope(p.projectId))) {
    const settles = p.kind === "BILL" || p.kind === "ADVANCE";
    const kindLabel = p.kind === "BILL" ? "Bill payment" : p.kind === "ADVANCE" ? "Advance" : p.kind === "WAGES" ? "Wages" : "Payment";
    events.push({
      at: p.paidOn,
      kind: "PAYMENT",
      label: `${kindLabel}${p.workOrder ? ` · ${p.workOrder.number}` : ""}${p.note ? ` · ${p.note}` : ""}`,
      project: p.project?.name ?? null,
      change: settles ? -p.amount : 0,
      paid: p.amount,
      currency: p.currency,
      reference: p.reference,
      mode: p.mode,
      receiptUrl: p.receiptUrl,
      by: p.paidBy.name,
    });
  }
  events.sort((a, b) => a.at.getTime() - b.at.getTime());
  let balance = 0;
  const lines: LedgerLine[] = events.map((e) => {
    balance = round2(balance + e.change);
    return { ...e, balance };
  });
  const totalPaid = round2(events.reduce((a, e) => a + e.paid, 0));
  const billed = round2(events.filter((e) => e.kind === "BILL_APPROVED").reduce((a, e) => a + e.change, 0));
  return { lines: lines.reverse(), balance, totalPaid, billed, currency: events[0]?.currency ?? wos[0]?.currency ?? "INR" };
}

/** Optional WhatsApp note to the contractor that a payment was made. */
export async function notifyPayee(phone: string | null, name: string, text: string) {
  if (!phone) return "no phone saved for them";
  if (!whatsappConfigured()) return "WhatsApp not connected";
  try {
    if (templateConfigured()) await sendTemplate(phone, name.split(" ")[0], text);
    else await sendText(phone, text);
    return "sent on WhatsApp";
  } catch (e) {
    return `WhatsApp failed: ${(e as Error).message}`.slice(0, 160);
  }
}
