import Link from "next/link";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, officeScope } from "@/lib/permissions";
import { money } from "@/lib/format";
import { scopedContractors, scopedProjects } from "@/lib/site-ops";
import { ActionForm } from "@/components/action-form";
import { Badge, Empty, Stat } from "@/components/ui";
import { ContractorFields } from "./fields";
import { saveContractor, approveBill, payBill, rejectBill } from "./actions";

export default async function ContractorsPage() {
  const user = await requireUser("contractors");
  const approver = can(user.role, "approve");
  const [list, projects, offices] = await Promise.all([scopedContractors(user), scopedProjects(user, true), officeScope(user) ? null : db.query.offices.findMany()]);
  const visible = new Set(projects.map((p) => p.id));
  const rows = list.map((c) => {
    const wos = c.workOrders.filter((w) => visible.has(w.projectId) && w.status !== "CANCELLED");
    const bills = wos.flatMap((w) => w.bills.map((b) => ({ ...b, wo: w })));
    const cur = wos[0]?.currency ?? c.office?.currency ?? "INR";
    const ok = bills.filter((b) => b.status === "APPROVED" || b.status === "PAID");
    return {
      c,
      open: wos.filter((w) => w.status === "OPEN").length,
      value: wos.reduce((a, w) => a + w.amount, 0),
      billed: ok.reduce((a, b) => a + b.amount, 0),
      paid: bills.filter((b) => b.status === "PAID").reduce((a, b) => a + b.amount, 0),
      cur,
      bills,
    };
  });
  const allBills = rows.flatMap((r) => r.bills.map((b) => ({ ...b, contractor: r.c })));
  const pending = allBills.filter((b) => b.status === "PENDING");
  const toPay = allBills.filter((b) => b.status === "APPROVED");

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="h-display text-3xl">Contractors</h1>
        <p className="text-sm text-muted">Work orders with agreed amounts, running bills, approvals and payments.</p>
      </div>

      {approver && (
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Bills to approve" value={pending.length} />
          <Stat label="Approved, to pay" value={toPay.length} />
        </div>
      )}

      {approver && pending.length + toPay.length > 0 && (
        <section className="card p-4">
          <p className="label">Bills waiting on you</p>
          <ul className="divide-y divide-line">
            {[...pending, ...toPay].map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div>
                  <p className="font-semibold">
                    {money(b.amount, b.wo.currency)} · {b.contractor.name}
                  </p>
                  <p className="text-xs text-muted">
                    <Link href={`/desk/contractors/wo/${b.wo.number}`} className="underline">
                      {b.wo.number}
                    </Link>{" "}
                    · {b.wo.title} · {b.wo.project.name}
                    {b.note ? ` · ${b.note}` : ""}
                  </p>
                </div>
                <form action={b.status === "PENDING" ? approveBill : payBill} className="flex flex-wrap items-center gap-1">
                  <input type="hidden" name="id" value={b.id} />
                  {b.billUrl && (
                    <a href={b.billUrl} target="_blank" rel="noreferrer" className="mr-1 text-xs font-semibold text-brass underline">
                      Bill
                    </a>
                  )}
                  {b.status === "PENDING" ? (
                    <>
                      <button className="btn-primary px-3 py-1.5 text-xs">
                        Approve
                      </button>
                      <button formAction={rejectBill} className="btn-ghost px-3 py-1.5 text-xs text-clay">
                        Reject
                      </button>
                    </>
                  ) : (
                    <>
                      <input name="reference" placeholder="UTR / cheque" className="input w-32 py-1.5 text-xs" />
                      <button className="btn-brass px-3 py-1.5 text-xs">
                        Mark paid
                      </button>
                    </>
                  )}
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <section className="card overflow-x-auto p-0">
          {!rows.length ? (
            <div className="p-4">
              <Empty>No contractors yet. Add your first one.</Empty>
            </div>
          ) : (
            <table className="table-clean">
              <thead>
                <tr>
                  <th>Contractor</th>
                  <th className="text-right">Work orders</th>
                  <th className="text-right">Billed</th>
                  <th className="text-right">Balance to pay</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.c.id}>
                    <td>
                      <Link href={`/desk/contractors/${r.c.id}`} className="font-semibold hover:text-brass">
                        {r.c.name}
                      </Link>{" "}
                      {!r.c.active && <Badge>Inactive</Badge>}
                      <p className="text-xs text-muted">
                        {r.c.trade}
                        {r.c.phone ? ` · ${r.c.phone}` : ""}
                        {r.open ? ` · ${r.open} open` : ""}
                      </p>
                    </td>
                    <td className="whitespace-nowrap text-right">{r.value ? money(r.value, r.cur) : "—"}</td>
                    <td className="whitespace-nowrap text-right">{r.billed ? money(r.billed, r.cur) : "—"}</td>
                    <td className={`whitespace-nowrap text-right font-semibold ${r.billed - r.paid > 0 ? "text-clay" : ""}`}>{r.billed - r.paid > 0 ? money(r.billed - r.paid, r.cur) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card content-start p-4">
          <p className="label">Add a contractor</p>
          <ActionForm action={saveContractor} submitLabel="Add contractor" className="grid gap-3">
            <ContractorFields offices={offices} />
          </ActionForm>
        </section>
      </div>
    </div>
  );
}
