import { asc } from "drizzle-orm";
import { db, offices, users } from "@/db";
import { requireUser } from "@/lib/auth";
import { roleLabels } from "@/lib/permissions";
import { Badge, PageHeader, Section } from "@/components/ui";
import { AddUserForm } from "./add-user-form";
import { resetPassword, toggleUserActive, updateOffice } from "./actions";

export const metadata = { title: "Team" };

export default async function AdminPage() {
  const me = await requireUser("admin");
  const [allOffices, team] = await Promise.all([
    db.select().from(offices).orderBy(asc(offices.createdAt)),
    db.query.users.findMany({ with: { office: true }, orderBy: asc(users.name) }),
  ]);

  return (
    <>
      <PageHeader title="Team & offices" subtitle="Who can sign in, what they can do, and office tax settings" />
      <div className="grid gap-5">
        <Section title="Add a team member">
          <AddUserForm offices={allOffices} canAddOwner={me.role === "OWNER"} />
        </Section>

        <Section title={`Team (${team.length})`}>
          <div className="overflow-x-auto">
            <table className="table-clean">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Office</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {team.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <p className="font-semibold">{u.name}</p>
                      <p className="text-xs text-muted">{u.email}</p>
                    </td>
                    <td>{roleLabels[u.role]}</td>
                    <td>{u.office?.name ?? "—"}</td>
                    <td>{u.active ? <Badge tone="olive">Active</Badge> : <Badge>Disabled</Badge>}</td>
                    <td>
                      {u.id !== me.id && (
                        <div className="flex flex-wrap justify-end gap-2">
                          <form action={resetPassword} className="flex gap-1">
                            <input type="hidden" name="id" value={u.id} />
                            <input name="password" placeholder="New password" minLength={8} className="input w-36 py-1.5" />
                            <button className="btn-ghost py-1.5">Reset</button>
                          </form>
                          <form action={toggleUserActive}>
                            <input type="hidden" name="id" value={u.id} />
                            <button className="btn-ghost py-1.5">{u.active ? "Disable" : "Enable"}</button>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Offices">
          <div className="grid gap-3">
            {allOffices.map((o) => (
              <form key={o.id} action={updateOffice} className="grid items-end gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                <input type="hidden" name="id" value={o.id} />
                <div>
                  <label className="label">Office</label>
                  <input name="name" defaultValue={o.name} className="input" />
                </div>
                <div>
                  <label className="label">Currency</label>
                  <input name="currency" defaultValue={o.currency} className="input" />
                </div>
                <div>
                  <label className="label">Tax</label>
                  <input name="taxLabel" defaultValue={o.taxLabel} className="input" />
                </div>
                <div>
                  <label className="label">Tax %</label>
                  <input name="taxRate" type="number" step="0.01" defaultValue={o.taxRate} className="input" />
                </div>
                <button className="btn-ghost">Save</button>
              </form>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}
