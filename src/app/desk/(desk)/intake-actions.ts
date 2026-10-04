"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { contractors, db, leadActivities, leads, offices } from "@/db";
import { requireUser } from "@/lib/auth";
import { canIntake } from "@/lib/permissions";
import { normalizePhone } from "@/lib/intake";
import { INTAKE_FIELDS, SKIP, missingFields, type IntakeFields, type IntakeKind } from "@/lib/intake-fields";
import { LEAD_SOURCES, PROPERTY_TYPES } from "@/lib/defaults";
import { TRADES } from "@/lib/site-costs";

type Result = { ok: true; id: string; href: string } | { ok: false; error: string };

const opt = (v: string | undefined) => (v && v !== SKIP ? v.trim() : null);

export async function saveIntake(kind: IntakeKind, input: IntakeFields, transcript: string): Promise<Result> {
  const user = await requireUser("voice");
  if (!canIntake(user.role)) return { ok: false, error: "Only the owner and admins can add these." };
  const f: IntakeFields = {};
  for (const d of INTAKE_FIELDS[kind]) f[d.key] = String(input[d.key] ?? "").trim().slice(0, 500);
  const missing = missingFields(kind, f).filter((m) => m.required);
  if (missing.length) return { ok: false, error: `Still needed: ${missing.map((m) => m.label).join(", ")}` };
  const phone = normalizePhone(f.phone);
  if (!phone) return { ok: false, error: "The phone number doesn't look right." };
  const office = await db.query.offices.findFirst({ where: eq(offices.id, f.office) });
  if (!office) return { ok: false, error: "Choose the office." };

  if (kind === "lead") {
    if (!PROPERTY_TYPES.includes(f.propertyType)) return { ok: false, error: "Choose the property type." };
    const followUp = /^\d{4}-\d{2}-\d{2}$/.test(f.nextFollowUpAt) ? new Date(`${f.nextFollowUpAt}T10:00:00`) : null;
    if (!followUp) return { ok: false, error: "The follow-up date isn't valid." };
    const [lead] = await db
      .insert(leads)
      .values({
        name: f.name,
        phone,
        email: opt(f.email),
        source: LEAD_SOURCES.includes(f.source) ? f.source : "Other",
        city: f.city,
        budgetBand: f.budgetBand,
        propertyType: f.propertyType,
        notes: opt(f.notes),
        officeId: office.id,
        ownerId: user.id,
        nextFollowUpAt: followUp,
      })
      .returning();
    await db.insert(leadActivities).values({ leadId: lead.id, type: "NOTE", summary: `Added by voice on the desk. Heard: ${transcript.slice(0, 1500)}`, userId: user.id });
    revalidatePath("/leads");
    revalidatePath("/");
    return { ok: true, id: lead.id, href: `/leads/${lead.id}` };
  }

  const [c] = await db
    .insert(contractors)
    .values({
      name: f.name,
      trade: (TRADES as readonly string[]).includes(f.trade) ? f.trade : "Other",
      phone,
      officeId: office.id,
      rateNotes: f.rateNotes,
      bankDetails: f.bankDetails,
    })
    .returning();
  revalidatePath("/desk/contractors", "layout");
  return { ok: true, id: c.id, href: `/desk/contractors/${c.id}` };
}
