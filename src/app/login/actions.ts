"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, users } from "@/db";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";

export async function login(_: { error?: string } | undefined, form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "Email or password is incorrect." };
  }
  const token = await signSession({ userId: user.id, name: user.name, role: user.role, officeId: user.officeId });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
  redirect(user.role === "SUPERVISOR" ? "/voice" : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
