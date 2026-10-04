import { asc } from "drizzle-orm";
import { db, offices, users } from "@/db";
import { requireUser } from "@/lib/auth";
import { roleLabels } from "@/lib/permissions";
import { Badge, PageHeader, Section } from "@/components/ui";
import { AddUserForm } from "./add-user-form";
import { resetPassword, setUserPhone, toggleUserActive, updateOffice } from "./actions";
import { saveWhatsappSettings } from "../inbox/actions";
import { getSettings } from "@/lib/settings";
import { appBaseUrl } from "@/lib/portal";
import { AiCheck } from "./ai-check";
import { templateConfigured, whatsappConfigured } from "@/lib/whatsapp";

export const metadata = { title: "Team" };

export default async function AdminPage() {
  const me = await requireUser("admin");
  const [allOffices, team] = await Promise.all([
    db.select().from(offices).orderBy(asc(offices.createdAt)),
    db.query.users.findMany({ with: { office: true }, orderBy: asc(users.name) }),
  ]);

  const wa = await getSettings();
  const base = await appBaseUrl();
  const checks: [string, boolean, string][] = [
    ["WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID", whatsappConfigured(), "Sending messages"],
    ["WHATSAPP_VERIFY_TOKEN", !!process.env.WHATSAPP_VERIFY_TOKEN, "Connecting the webhook"],
    ["WHATSAPP_APP_SECRET", !!process.env.WHATSAPP_APP_SECRET, "Receiving messages securely"],
    ["WHATSAPP_TEMPLATE_NAME", templateConfigured(), "Updates when the client hasn't messaged in 24h"],
    ["ANTHROPIC_API_KEY", !!process.env.ANTHROPIC_API_KEY, "Smart replies (otherwise rule-based)"],
    ["CRON_SECRET", !!process.env.CRON_SECRET, "Saturday weekly summaries"],
  ];
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
                      <form action={setUserPhone} className="mt-1 flex gap-1">
                        <input type="hidden" name="id" value={u.id} />
                        <input name="phone" defaultValue={u.phone ?? ""} placeholder="WhatsApp +91…" className="input w-36 py-1 text-xs" aria-label="Phone" />
                        <button className="btn-ghost px-2 py-1 text-xs">Save</button>
                      </form>
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

        <Section title="WhatsApp assistant">
          <form action={saveWhatsappSettings} className="grid gap-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${wa.whatsappMode === "approve" ? "border-ink" : "border-line"}`}>
                <input type="radio" name="whatsappMode" value="approve" defaultChecked={wa.whatsappMode === "approve"} className="mt-1" />
                <span>
                  <span className="block font-semibold">Approve before sending</span>
                  <span className="text-xs text-muted">The assistant drafts replies; a person checks and sends them from the WhatsApp inbox. Recommended for the first weeks.</span>
                </span>
              </label>
              <label className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${wa.whatsappMode === "auto" ? "border-ink" : "border-line"}`}>
                <input type="radio" name="whatsappMode" value="auto" defaultChecked={wa.whatsappMode === "auto"} className="mt-1" />
                <span>
                  <span className="block font-semibold">Reply automatically</span>
                  <span className="text-xs text-muted">Clients get instant answers. Complaints and requests for a person are always handed to your team.</span>
                </span>
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="weeklySummary" defaultChecked={wa.weeklySummary} className="h-4 w-4" />
              Send every client a weekly project summary on Saturday morning
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="dailySummary" defaultChecked={wa.dailySummary} className="h-4 w-4" />
              Send owners and admins (with a phone number on their profile) the evening site summary at 7 pm IST
            </label>
            <div>
              <button className="btn-primary">Save WhatsApp settings</button>
            </div>
          </form>
          <div className="mt-5 border-t border-line pt-4">
            <p className="label">Setup checklist (Vercel → Settings → Environment Variables)</p>
            <ul className="grid gap-1.5 text-sm">
              {checks.map(([name, ok, what]) => (
                <li key={name} className="flex items-start gap-2">
                  <span className={ok ? "text-olive" : "text-clay"}>{ok ? "✓" : "✗"}</span>
                  <span>
                    <code className="text-xs">{name}</code> <span className="text-muted">— {what}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <AiCheck />
            </div>
            <p className="mt-3 text-xs text-muted">
              Webhook URL for Meta: <code className="break-all">{base}/api/whatsapp/webhook</code> · subscribe to the <code>messages</code> field.
            </p>
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
