"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, rateItems } from "@/db";
import { requireUser } from "@/lib/auth";

const n = (v: FormDataEntryValue | null) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export async function saveRate(form: FormData) {
  await requireUser("rates");
  const values = {
    category: String(form.get("category") ?? "").trim() || "General",
    name: String(form.get("name") ?? "").trim(),
    unit: String(form.get("unit") ?? "").trim() || "nos",
    cost: n(form.get("cost")),
    price: n(form.get("price")),
    currency: String(form.get("currency") ?? "INR").toUpperCase(),
  };
  if (!values.name) return;
  const id = String(form.get("id") ?? "");
  if (id) await db.update(rateItems).set(values).where(eq(rateItems.id, id));
  else await db.insert(rateItems).values(values);
  revalidatePath("/rates");
}

export async function deleteRate(form: FormData) {
  await requireUser("rates");
  await db.delete(rateItems).where(eq(rateItems.id, String(form.get("id"))));
  revalidatePath("/rates");
}
