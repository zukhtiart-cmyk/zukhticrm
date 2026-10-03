import { requireUser } from "@/lib/auth";
import { PageHeader, Section } from "@/components/ui";
import { createLead } from "../actions";
import { LeadForm } from "../lead-form";
import { leadFormOptions } from "../data";

export const metadata = { title: "New lead" };

export default async function NewLeadPage() {
  const user = await requireUser("leads");
  const { offices, owners } = await leadFormOptions(user);
  return (
    <>
      <PageHeader title="New lead" back={{ href: "/leads", label: "Leads" }} />
      <Section title="Lead details">
        <LeadForm action={createLead} offices={offices} owners={owners} lead={{ officeId: user.officeId ?? undefined }} submitLabel="Create lead" />
      </Section>
    </>
  );
}
