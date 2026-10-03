"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, offices, roleEnum, users } from "@/db";
import { requireUser } from "@/lib/auth";

const userSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(roleEnum.enumValues),
  officeId: z.string().min(1),
  phone: z.string().trim().optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function addUser(_: unknown, form: FormData) {
  const me = await requireUser("admin");
  const parsed = userSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.role === "OWNER" && me.role !== "OWNER") return { error: "Only the owner can add another owner." };
  const exists = await db.query.users.findFirst({ where: eq(users.email, parsed.data.email) });
  if (exists) return { error: "A user with this email already exists." };
  const { password, ...rest } = parsed.data;
  await db.insert(users).values({ ...rest, phone: rest.phone || null, passwordHash: await bcrypt.hash(password, 10) });
  revalidatePath("/admin");
  return { ok: `${rest.name} can now sign in.` };
}

export async function toggleUserActive(form: FormData) {
  const me = await requireUser("admin");
  const id = String(form.get("id"));
  if (id === me.id) return;
  const u = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!u || (u.role === "OWNER" && me.role !== "OWNER")) return;
  await db.update(users).set({ active: !u.active }).where(eq(users.id, id));
  revalidatePath("/admin");
}

export async function resetPassword(form: FormData) {
  await requireUser("admin");
  const id = String(form.get("id"));
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return;
  await db.update(users).set({ passwordHash: await bcrypt.hash(password, 10) }).where(eq(users.id, id));
  revalidatePath("/admin");
}

export async function updateOffice(form: FormData) {
  await requireUser("admin");
  const id = String(form.get("id"));
  const taxRate = Number(form.get("taxRate"));
  await db
    .update(offices)
    .set({
      name: String(form.get("name")),
      currency: String(form.get("currency")).toUpperCase(),
      taxLabel: String(form.get("taxLabel")),
      taxRate: Number.isFinite(taxRate) ? taxRate : 0,
    })
    .where(eq(offices.id, id));
  revalidatePath("/admin");
}
