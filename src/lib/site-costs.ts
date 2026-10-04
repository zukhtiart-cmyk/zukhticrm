import "server-only";
import { eq, inArray } from "drizzle-orm";
import { boqItems, contractorBills, db, orders, siteExpenses, workOrders } from "@/db";
import { round2 } from "./format";

/**
 * Budget vs spend for one project, in the project's currency.
 * Budget = BOQ estimated cost (material + labour).
 * Committed = purchase orders + approved site expenses + contractor work orders (or bills, if higher).
 */
export async function projectCosts(projectId: string) {
  const [items, pos, expenses, wos] = await Promise.all([
    db.select({ qty: boqItems.qty, unitCost: boqItems.unitCost, unitPrice: boqItems.unitPrice }).from(boqItems).where(eq(boqItems.projectId, projectId)),
    db.select({ qty: orders.qty, unitCost: orders.unitCost, fxRate: orders.fxRate }).from(orders).where(eq(orders.projectId, projectId)),
    db.select({ amount: siteExpenses.amount, status: siteExpenses.status }).from(siteExpenses).where(eq(siteExpenses.projectId, projectId)),
    db.select({ id: workOrders.id, amount: workOrders.amount, status: workOrders.status }).from(workOrders).where(eq(workOrders.projectId, projectId)),
  ]);
  const bills = wos.length ? await db.select({ workOrderId: contractorBills.workOrderId, amount: contractorBills.amount, status: contractorBills.status }).from(contractorBills).where(inArray(contractorBills.workOrderId, wos.map((w) => w.id))) : [];

  const budget = items.reduce((a, i) => a + i.qty * i.unitCost, 0);
  const sell = items.reduce((a, i) => a + i.qty * i.unitPrice, 0);
  const purchase = pos.reduce((a, o) => a + (o.qty ?? 0) * (o.unitCost ?? 0) * (o.fxRate ?? 1), 0);
  const expensesApproved = expenses.filter((e) => e.status === "APPROVED" || e.status === "PAID").reduce((a, e) => a + e.amount, 0);
  const expensesPending = expenses.filter((e) => e.status === "PENDING").reduce((a, e) => a + e.amount, 0);
  const live = wos.filter((w) => w.status !== "CANCELLED");
  const okBills = bills.filter((b) => b.status === "APPROVED" || b.status === "PAID");
  let contractorCommitted = 0;
  for (const w of live) {
    const billed = okBills.filter((b) => b.workOrderId === w.id).reduce((a, b) => a + b.amount, 0);
    contractorCommitted += Math.max(w.amount, billed);
  }
  const contractorBilled = okBills.reduce((a, b) => a + b.amount, 0);
  const contractorPaid = bills.filter((b) => b.status === "PAID").reduce((a, b) => a + b.amount, 0);
  const committed = purchase + expensesApproved + contractorCommitted;
  const projectedCost = Math.max(budget, committed);
  return {
    budget: round2(budget),
    sell: round2(sell),
    purchase: round2(purchase),
    expensesApproved: round2(expensesApproved),
    expensesPending: round2(expensesPending),
    contractorCommitted: round2(contractorCommitted),
    contractorBilled: round2(contractorBilled),
    contractorPaid: round2(contractorPaid),
    committed: round2(committed),
    usedPct: budget ? Math.round((committed / budget) * 100) : 0,
    overrun: budget > 0 && committed > budget,
    projectedMarginPct: sell ? Math.round(((sell - projectedCost) / sell) * 1000) / 10 : 0,
  };
}

export const EXPENSE_CATEGORIES = ["Material", "Labour", "Transport", "Tools & consumables", "Food & site", "Other"] as const;
export const TRADES = ["Carpenter", "Painter", "Electrician", "Plumber", "False ceiling", "Civil / mason", "Tiling", "Polish", "Fabrication", "Cleaning", "Other"] as const;
