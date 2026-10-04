import { NextResponse } from "next/server";
import { eq, or } from "drizzle-orm";
import { clients, contractors, db, leads, offices, users } from "@/db";
import { getSession } from "@/lib/auth";
import { canIntake } from "@/lib/permissions";
import {
  aiExtract,
  basicExtract,
  nextQuestion,
  normalizePhone,
  type IntakeCtx,
} from "@/lib/intake";
import {
  INTAKE_FIELDS,
  type IntakeFields,
  type IntakeKind,
} from "@/lib/intake-fields";
import { transcribe } from "@/lib/voice-ai";

export const maxDuration = 60;

/**
 * Voice intake for a new lead or contractor (owner and admin).
 * Takes what was said (text and/or audio) plus the form so far, returns the updated form
 * and the next question for anything still missing.
 */
export async function POST(req: Request) {
  const session = await getSession();
  const user = session
    ? await db.query.users.findFirst({ where: eq(users.id, session.userId) })
    : null;
  if (!user || !user.active || !canIntake(user.role))
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const form = await req.formData();
  const kind = String(form.get("kind")) as IntakeKind;
  if (kind !== "lead" && kind !== "contractor")
    return NextResponse.json({ error: "Unknown form" }, { status: 400 });
  let current: IntakeFields = {};
  try {
    const raw = JSON.parse(String(form.get("fields") ?? "{}"));
    for (const d of INTAKE_FIELDS[kind])
      if (typeof raw[d.key] === "string")
        current[d.key] = raw[d.key].slice(0, 500);
  } catch {
    current = {};
  }
  const askingRaw = String(form.get("asking") ?? "");
  const asking = INTAKE_FIELDS[kind].some((d) => d.key === askingRaw)
    ? askingRaw
    : null;
  let text = String(form.get("text") ?? "").trim();
  const audio = form.get("audio");
  let notice: string | undefined;

  if (audio instanceof File && audio.size > 0) {
    try {
      const heard = await transcribe(
        audio,
        `New ${kind} details for an interior design company: names, Indian/UAE phone numbers, cities, budgets in lakh/crore/AED, trades, UPI IDs. Hindi, Hinglish or English.`,
      );
      text = [text, heard].filter(Boolean).join(" ");
    } catch (e) {
      if (!text)
        return NextResponse.json(
          { error: (e as Error).message, speechFailed: true },
          { status: 502 },
        );
      notice = `${(e as Error).message} Your typed text was used.`;
    }
  }
  if (!text)
    return NextResponse.json(
      { error: "Nothing was heard — try again or type it." },
      { status: 400 },
    );

  const officeRows = await db.select().from(offices);
  const ctx: IntakeCtx = {
    today: new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
    }).format(new Date()),
    offices: officeRows.map((o) => ({
      id: o.id,
      name: o.name,
      city: o.city,
      currency: o.currency,
    })),
    defaultOfficeId: user.officeId,
    speaker: user.name,
  };

  let fields: IntakeFields;
  let mode: "ai" | "basic" = "basic";
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      fields = await aiExtract(kind, text, current, asking, ctx);
      mode = "ai";
    } catch (e) {
      console.error("intake AI failed", e);
      notice = [
        notice,
        "AI is unavailable right now, so answers are filled field by field — check them before saving.",
      ]
        .filter(Boolean)
        .join(" ");
      fields = basicExtract(kind, text, current, asking, ctx);
    }
  } else fields = basicExtract(kind, text, current, asking, ctx);

  // Warn about a phone number we already have.
  let duplicate: string | undefined;
  const phone = fields.phone ? normalizePhone(fields.phone) : "";
  if (phone) {
    const tail = phone.slice(-10);
    if (kind === "lead") {
      const [l] = await db
        .select({ name: leads.name, phone: leads.phone })
        .from(leads)
        .where(or(eq(leads.phone, phone), eq(leads.phone, tail)));
      const [c] = l
        ? []
        : await db
            .select({ name: clients.name })
            .from(clients)
            .where(or(eq(clients.phone, phone), eq(clients.phone, tail)));
      if (l) duplicate = `This number is already a lead: ${l.name}.`;
      else if (c)
        duplicate = `This number belongs to an existing client: ${c.name}.`;
    } else {
      const [c] = await db
        .select({ name: contractors.name })
        .from(contractors)
        .where(or(eq(contractors.phone, phone), eq(contractors.phone, tail)));
      if (c)
        duplicate = `This number is already saved for contractor ${c.name}.`;
    }
  }

  return NextResponse.json({
    fields,
    heard: text,
    mode,
    notice,
    duplicate,
    ...nextQuestion(kind, fields),
  });
}
