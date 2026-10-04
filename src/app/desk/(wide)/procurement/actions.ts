"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, orderStatusEnum, orders, vendors } from "@/db";
import { createPurchaseOrder, type NewPo } from "@/lib/procurement";
import { requireUser } from "@/lib/auth";
import { setSetting } from "@/lib/settings";
import { officeScope } from "@/lib/permissions";

const n = (v: FormDataEntryValue | null) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const opt = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;
const day = (v: FormDataEntryValue | null) => (v ? new Date(`${v}T10:00:00`) : null);

// ---------- Vendors ----------

export async function saveVendor(_: unknown, form: FormData) {
  await requireUser("orders");
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Vendor name is required." };
  const values = {
    name,
    country: String(form.get("country") ?? "China").trim() || "China",
    city: opt(form.get("city")),
    category: opt(form.get("category")),
    contactName: opt(form.get("contactName")),
    phone: opt(form.get("phone")),
    email: opt(form.get("email")),
    currency: String(form.get("currency") ?? "CNY").toUpperCase(),
    leadTimeDays: form.get("leadTimeDays") ? Math.round(n(form.get("leadTimeDays"))) : null,
    notes: opt(form.get("notes")),
    active: form.get("active") !== "off",
  };
  const id = String(form.get("id") ?? "");
  if (id) await db.update(vendors).set(values).where(eq(vendors.id, id));
  else await db.insert(vendors).values(values);
  revalidatePath("/desk/procurement", "layout");
  return { ok: id ? "Saved." : `${name} added.` };
}

// ---------- Purchase orders ----------

export async function createPo(input: NewPo): Promise<{ error: string } | undefined> {
  const user = await requireUser("orders");
  const res = await createPurchaseOrder(user, input);
  if ("error" in res) return res;
  revalidatePath("/desk/procurement", "layout");
  revalidatePath(`/projects/${res.projectId}`, "layout");
  redirect(`/desk/procurement/po/${res.poNumber}`);
}

/** Updates every line of a PO at once (status, ETA, shipping details). */
export async function updatePo(form: FormData) {
  const user = await requireUser("orders");
  const poNumber = String(form.get("poNumber"));
  const lines = await db.query.orders.findMany({ where: eq(orders.poNumber, poNumber), with: { project: true } });
  const scope = officeScope(user);
  if (!lines.length || (scope && lines.some((l) => l.project.officeId !== scope))) return;
  const status = z.enum(orderStatusEnum.enumValues).parse(form.get("status"));
  const now = new Date();
  for (const l of lines) {
    await db
      .update(orders)
      .set({
        status,
        eta: form.get("eta") ? day(form.get("eta")) : l.eta,
        containerNo: opt(form.get("containerNo")) ?? l.containerNo,
        port: opt(form.get("port")) ?? l.port,
        shippedAt: ["SHIPPED", "CUSTOMS", "DELIVERED"].includes(status) ? (l.shippedAt ?? now) : null,
        deliveredAt: status === "DELIVERED" ? (l.deliveredAt ?? now) : null,
      })
      .where(eq(orders.id, l.id));
  }
  revalidatePath("/desk/procurement", "layout");
  for (const pid of new Set(lines.map((l) => l.projectId))) revalidatePath(`/projects/${pid}`, "layout");
}

// ---------- Exchange rates ----------

export async function saveFxRates(form: FormData) {
  await requireUser("admin");
  const perINR: Record<string, number> = { INR: 1 };
  for (const [k, v] of form.entries()) {
    if (!k.startsWith("rate_")) continue;
    const code = k.slice(5).toUpperCase();
    const x = Number(v);
    if (/^[A-Z]{3}$/.test(code) && x > 0) perINR[code] = x;
  }
  const extra = String(form.get("newCode") ?? "").trim().toUpperCase();
  const extraRate = Number(form.get("newRate"));
  if (/^[A-Z]{3}$/.test(extra) && extraRate > 0) perINR[extra] = extraRate;
  await setSetting("fxRates", { asOf: new Date().toISOString().slice(0, 10), perINR });
  revalidatePath("/rates");
}
