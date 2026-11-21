"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, rateItems } from "@/db";
import { requireUser } from "@/lib/auth";
import { insertStandardItems } from "@/lib/boq-seed";
import { ROOM_GROUPS } from "@/lib/boq-library";

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
    ...(form.has("planSent")
      ? {
          title: String(form.get("title") ?? "").trim().toUpperCase() || null,
          spec: String(form.get("spec") ?? "").trim() || null,
          roomTypes: form.getAll("roomTypes").map(String).filter((g) => (ROOM_GROUPS as readonly string[]).includes(g)),
          preselect: form.get("preselect") === "1",
          qtyRule: String(form.get("qtyRule") ?? "one").slice(0, 40) || "one",
        }
      : {}),
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

/** Adds Zukhti's standard quotation items (with plan rules) to the library. */
export async function loadStandardItems() {
  await requireUser("rates");
  await insertStandardItems();
  revalidatePath("/rates");
}
