"use server";

import bcrypt from "bcryptjs";
import { timingSafeEqual } from "node:crypto";
import { asc, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, offices, users } from "@/db";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";

export async function hasUsers() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  return n > 0;
}

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** One-time owner setup. Works only while no users exist, and only with the AUTH_SECRET as the setup code. */
export async function createFirstOwner(_: unknown, form: FormData) {
  if (await hasUsers()) redirect("/login");
  const code = String(form.get("code") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!process.env.AUTH_SECRET || !sameSecret(code, process.env.AUTH_SECRET)) return { error: "Setup code doesn't match the AUTH_SECRET you set in Vercel." };
  if (!name || !email.includes("@")) return { error: "Enter your name and email." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  let [office] = await db.select().from(offices).orderBy(asc(offices.createdAt)).limit(1);
  if (!office) {
    [office] = await db
      .insert(offices)
      .values([
        { name: "Mumbai HQ", city: "Mumbai", currency: "INR", taxLabel: "GST", taxRate: 18 },
        { name: "Dubai", city: "Dubai", currency: "AED", taxLabel: "VAT", taxRate: 5 },
        { name: "China sourcing", city: "Foshan", currency: "CNY", taxLabel: "VAT", taxRate: 13 },
      ])
      .returning();
  }
  if (await hasUsers()) redirect("/login");
  const [user] = await db.insert(users).values({ name, email, role: "OWNER", officeId: office.id, passwordHash: await bcrypt.hash(password, 10) }).returning();
  const token = await signSession({ userId: user.id, name: user.name, role: user.role, officeId: user.officeId });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
  redirect("/admin");
}
