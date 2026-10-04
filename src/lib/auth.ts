import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "./session";
import { can, isDeskOnly, type Capability } from "./permissions";
export { officeScope } from "./permissions";

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/** Returns the signed-in, still-active user or redirects to login. */
export async function requireUser(capability?: Capability) {
  const session = await getSession();
  if (!session) redirect("/login");
  const user = await db.query.users.findFirst({ where: eq(users.id, session.userId), with: { office: true } });
  if (!user || !user.active) redirect("/login");
  if (capability && !can(user.role, capability)) redirect(isDeskOnly(user.role) ? "/desk" : "/?denied=1");
  return user;
}

export type CurrentUser = Awaited<ReturnType<typeof requireUser>>;
