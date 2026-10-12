import "server-only";
import { eq } from "drizzle-orm";
import { db, offices } from "@/db";
import type { Role } from "@/db/schema";
import { can } from "./permissions";
import {
  approvalsPending,
  followUpsDue,
  openSnags,
  sitesWithoutUpdate,
} from "./assistant-data";

type U = { id: string; name: string; role: Role; officeId: string | null };

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
const names = (xs: string[]) =>
  xs.length <= 2
    ? xs.join(" and ")
    : `${xs.slice(0, 2).join(", ")} and ${xs.length - 2} more`;
/** "Shah residence, Bandra West (last update: …)" → "Shah residence" */
const shortName = (s: string) => s.split(/[,(·:]/)[0].trim();

/**
 * What Zuki says when it opens: a greeting by name and time of day, then the two or three things
 * that most need this person today — only what their role can see.
 */
export async function greetingFor(user: U) {
  const office = user.officeId
    ? await db.query.offices.findFirst({ where: eq(offices.id, user.officeId) })
    : null;
  const tz = office?.currency === "AED" ? "Asia/Dubai" : "Asia/Kolkata";
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: tz,
    }).format(new Date()),
  );
  const hello =
    hour < 5
      ? "Working late"
      : hour < 12
        ? "Good morning"
        : hour < 17
          ? "Good afternoon"
          : "Good evening";
  const first = user.name.split(" ")[0].replace(/[()]/g, "");

  const nudges: string[] = [];
  const safe = async <T>(f: () => Promise<T>) => {
    try {
      return await f();
    } catch (e) {
      console.error("greeting lookup failed", e);
      return null;
    }
  };

  // Site updates: anyone who records them.
  if (can(user.role, "voice") && can(user.role, "stages")) {
    const r = await safe(() => sitesWithoutUpdate(user, 1));
    const missing = r && "withoutUpdate" in r ? r.withoutUpdate : [];
    if (missing.length === 1)
      nudges.push(
        `${shortName(missing[0])} has no site update since yesterday.`,
      );
    else if (missing.length > 1)
      nudges.push(
        `${plural(missing.length, "site")} — ${names(missing.map(shortName))} — have no update since yesterday.`,
      );
  }
  // Approvals and payouts.
  if (can(user.role, "approve")) {
    const r = await safe(() => approvalsPending(user));
    if (r && "expensesToApprove" in r) {
      const exp = r.expensesToApprove ?? [];
      const bills = r.billsToApprove ?? [];
      const unpaid = r.billsApprovedNotPaid ?? [];
      const parts = [
        exp.length ? plural(exp.length, "expense") : "",
        bills.length ? plural(bills.length, "contractor bill") : "",
      ].filter(Boolean);
      const total = exp.length + bills.length;
      if (parts.length)
        nudges.push(
          `${parts.join(" and ")} ${total === 1 ? "is" : "are"} waiting for your approval.`,
        );
      if (can(user.role, "payouts") && unpaid.length)
        nudges.push(
          `${plural(unpaid.length, "approved bill")} still to be paid.`,
        );
    }
  }
  // Leads.
  if (can(user.role, "leads")) {
    const r = await safe(() => followUpsDue(user));
    const due = r && "followUps" in r ? r.followUps : [];
    if (due.length)
      nudges.push(
        `${due.length === 1 ? "One lead" : plural(due.length, "lead")} to follow up today: ${names(due.map(shortName))}.`,
      );
  }
  // Snags, for the people who fix them.
  if (can(user.role, "snags") && !can(user.role, "approve")) {
    const r = await safe(() => openSnags(user));
    const open =
      r && "snags" in r ? r.snags.filter((s) => s.includes("(open")).length : 0;
    if (open) nudges.push(`${plural(open, "snag")} still open.`);
  }

  const top = nudges.slice(0, 3);
  const text = top.length
    ? `${hello}, ${first}! ${top.join(" ")} Where do you want to start?`
    : `${hello}, ${first}! All quiet so far. What's happening today?`;
  return { text, nudges: top, attention: top.length > 0, firstName: first, tzMinutes: tz === "Asia/Dubai" ? 240 : 330 };
}
