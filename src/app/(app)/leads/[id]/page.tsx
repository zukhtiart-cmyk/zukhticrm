import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, leadActivities, leads, leadStatusEnum, projects } from "@/db";
import { officeScope, requireUser } from "@/lib/auth";
import { dateInput, dateTime, titleCase } from "@/lib/format";
import { Badge, PageHeader, Section, StatusBadge } from "@/components/ui";
import { convertLead, logActivity, setLeadStatus, updateLead } from "../actions";
import { LeadForm } from "../lead-form";
import { leadFormOptions } from "../data";

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser("leads");
  const scope = officeScope(user);
  const lead = await db.query.leads.findFirst({
    where: scope ? and(eq(leads.id, id), eq(leads.officeId, scope)) : eq(leads.id, id),
    with: { activities: { with: { user: true }, orderBy: desc(leadActivities.at) } },
  });
  if (!lead) notFound();
  const { offices, owners } = await leadFormOptions(user);
  const project = lead.clientId ? await db.query.projects.findFirst({ where: eq(projects.clientId, lead.clientId) }) : null;

  return (
    <>
      <PageHeader
        title={lead.name}
        back={{ href: "/leads", label: "Leads" }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={lead.status} />
            <a href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`} target="_blank" className="font-semibold text-olive hover:underline">
              WhatsApp {lead.phone}
            </a>
          </span>
        }
        actions={
          project ? (
            <Link href={`/projects/${project.id}`} className="btn-brass">
              Open project
            </Link>
          ) : null
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="grid content-start gap-5">
          <Section title="Pipeline stage">
            <div className="flex flex-wrap gap-2">
              {leadStatusEnum.enumValues.map((s) => (
                <form key={s} action={setLeadStatus}>
                  <input type="hidden" name="id" value={lead.id} />
                  <input type="hidden" name="status" value={s} />
                  <button className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${lead.status === s ? "border-ink bg-ink text-paper" : "border-line text-muted hover:border-ink hover:text-ink"}`}>
                    {titleCase(s)}
                  </button>
                </form>
              ))}
            </div>
          </Section>
          <Section title="Details">
            <LeadForm action={updateLead} lead={lead} offices={offices} owners={owners} submitLabel="Save changes" />
          </Section>
        </div>

        <div className="grid content-start gap-5">
          {!project && (
            <Section title="Won the job?">
              <form action={convertLead} className="grid gap-3">
                <input type="hidden" name="id" value={lead.id} />
                <div>
                  <label className="label">Project name</label>
                  <input name="projectName" defaultValue={`${lead.name} residence`} className="input" />
                </div>
                <div>
                  <label className="label">Site address</label>
                  <input name="siteAddress" className="input" />
                </div>
                <button className="btn-brass">Convert to client & create project</button>
                <p className="text-xs text-muted">Creates the client, the 8 standard stages and the payment schedule.</p>
              </form>
            </Section>
          )}
          <Section title="Log a call, message or meeting">
            <form action={logActivity} className="grid gap-3">
              <input type="hidden" name="id" value={lead.id} />
              <select name="type" className="input">
                <option value="CALL">Call</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="MEETING">Meeting / site visit</option>
                <option value="NOTE">Note</option>
              </select>
              <textarea name="summary" rows={3} placeholder="What happened?" className="input" />
              <div>
                <label className="label">Next follow-up</label>
                <input name="nextFollowUpAt" type="date" defaultValue={dateInput(lead.nextFollowUpAt)} className="input" />
              </div>
              <button className="btn-primary">Save</button>
            </form>
          </Section>
          <Section title="History">
            <ol className="grid gap-3">
              {lead.activities.map((a) => (
                <li key={a.id} className="border-l-2 border-brass/40 pl-3">
                  <div className="flex items-center gap-2">
                    <Badge>{titleCase(a.type)}</Badge>
                    <span className="text-xs text-muted">{dateTime(a.at)}</span>
                  </div>
                  <p className="mt-1 text-sm">{a.summary}</p>
                  {a.user && <p className="text-xs text-muted">{a.user.name}</p>}
                </li>
              ))}
              {!lead.activities.length && <p className="text-sm text-muted">Nothing logged yet.</p>}
            </ol>
          </Section>
        </div>
      </div>
    </>
  );
}
