import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, offices, users } from "@/db";
import { officeScope, type CurrentUser } from "@/lib/auth";

/** Offices and possible lead owners the current user may pick from. */
export async function leadFormOptions(user: CurrentUser) {
  const scope = officeScope(user);
  const [officeRows, ownerRows] = await Promise.all([
    db.select({ id: offices.id, name: offices.name }).from(offices).where(scope ? eq(offices.id, scope) : undefined).orderBy(asc(offices.createdAt)),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.active, true), inArray(users.role, ["OWNER", "ADMIN", "DESIGNER"]), scope ? eq(users.officeId, scope) : undefined))
      .orderBy(asc(users.name)),
  ]);
  return { offices: officeRows, owners: ownerRows };
}
