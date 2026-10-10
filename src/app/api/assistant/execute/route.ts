import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { assistantContext, finalize } from "@/lib/assistant";
import { HANDOFF, type AssistantAction } from "@/lib/assistant-types";
import { recordPayment } from "@/app/desk/(wide)/payments/actions";
import { addExpense } from "@/app/desk/(wide)/expenses/actions";
import { addSnag } from "@/app/desk/(wide)/snags/actions";

export const maxDuration = 60;

type Result = { index: number; ok: boolean; message: string; href?: string };

/**
 * Saves the confirmed assistant actions using the same checks as the screens they belong to
 * (role, office scope, bill rules). Hand-off actions (project update, new lead/contractor) aren't saved here.
 */
export async function POST(req: Request) {
  const session = await getSession();
  const user = session
    ? await db.query.users.findFirst({ where: eq(users.id, session.userId) })
    : null;
  if (!user || !user.active || !can(user.role, "voice"))
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const form = await req.formData();
  let raw: AssistantAction[] = [];
  try {
    raw = JSON.parse(String(form.get("actions") ?? "[]"));
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const photoAt = (i: number) => {
    const f = form.get(`photo_${i}`);
    return f instanceof File && f.size > 0 ? f : null;
  };
  const ctx = await assistantContext(user);
  // Keep each action's original position so its photo (photo_<i>) stays attached to it.
  const allowed = raw
    .slice(0, 10)
    .map((a, i) => ({ a, i }))
    .filter((x) => ctx.allowed.includes(x.a.type));
  const photos = new Set(
    allowed.map((x, j) => (photoAt(x.i) ? j : -1)).filter((j) => j >= 0),
  );
  const { actions, missing } = await finalize(
    allowed.map((x) => x.a),
    ctx,
    photos,
  );
  const blocking = missing.filter((m) => !m.optional);
  if (blocking.length)
    return NextResponse.json(
      {
        error: `Still needed: ${blocking.map((m) => `${m.label} (item ${m.index + 1})`).join(", ")}`,
      },
      { status: 400 },
    );

  const results: Result[] = [];
  for (const [i, a] of actions.entries()) {
    if (HANDOFF.includes(a.type)) continue;
    const fd = new FormData();
    const photo = photoAt(allowed[i].i);
    try {
      if (a.type === "payment") {
        fd.set("contractorId", a.contractorId!);
        fd.set("projectId", a.projectId!);
        fd.set("kind", a.kind ?? "ADVANCE");
        if (a.billId) fd.set("billId", a.billId);
        fd.set("amount", String(a.amount));
        fd.set("mode", a.mode!);
        if (a.reference) fd.set("reference", a.reference);
        if (a.note) fd.set("note", a.note.slice(0, 500));
        if (photo) fd.set("receipt", photo);
        const r = await recordPayment(undefined, fd);
        results.push({
          index: allowed[i].i,
          ok: !r?.error,
          message: r?.error ?? r?.ok ?? "Saved",
          href: `/desk/contractors/${a.contractorId}#ledger`,
        });
      } else if (a.type === "expense") {
        fd.set("projectId", a.projectId!);
        fd.set("category", a.category ?? "Other");
        fd.set("description", (a.description ?? "").slice(0, 300));
        if (a.paidTo) fd.set("paidTo", a.paidTo);
        fd.set("amount", String(a.amount));
        if (photo) fd.set("bill", photo);
        const r = await addExpense(undefined, fd);
        results.push({
          index: allowed[i].i,
          ok: !r?.error,
          message: r?.error ?? r?.ok ?? "Saved",
          href: `/desk/expenses?project=${a.projectId}`,
        });
      } else if (a.type === "snag") {
        fd.set("projectId", a.projectId!);
        fd.set("room", a.room ?? "General");
        fd.set("description", (a.description ?? "").slice(0, 500));
        if (a.contractorId) fd.set("contractorId", a.contractorId);
        if (photo) fd.set("photo", photo);
        const r = await addSnag(undefined, fd);
        results.push({
          index: allowed[i].i,
          ok: !r?.error,
          message: r?.error ?? r?.ok ?? "Saved",
          href: `/desk/snags?project=${a.projectId}`,
        });
      }
    } catch (e) {
      const msg = (e as Error).message;
      // requireUser redirects when a role lacks access; report it instead of following it.
      results.push({
        index: allowed[i].i,
        ok: false,
        message: msg.includes("NEXT_REDIRECT")
          ? "You don't have access to save this."
          : msg.slice(0, 200),
      });
    }
  }
  return NextResponse.json({ results });
}
