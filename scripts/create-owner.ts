/**
 * First-time production setup: creates the three offices (if none exist) and the owner login.
 * Usage:  npm run create-owner -- you@zukhti.com "Your Name" "a-strong-password"
 */
import bcrypt from "bcryptjs";
import { asc, eq } from "drizzle-orm";
import { db, offices, users } from "../src/db";

async function main() {
  const [email, name, password] = process.argv.slice(2);
  if (!email || !name || !password || password.length < 8) {
    console.error('Usage: npm run create-owner -- email "Full Name" "password (8+ chars)"');
    process.exit(1);
  }
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
    console.log("Created offices: Mumbai HQ, Dubai, China sourcing");
  }
  const exists = await db.query.users.findFirst({ where: eq(users.email, email.toLowerCase()) });
  if (exists) {
    console.error("A user with that email already exists.");
    process.exit(1);
  }
  await db.insert(users).values({ email: email.toLowerCase(), name, role: "OWNER", officeId: office.id, passwordHash: await bcrypt.hash(password, 10) });
  console.log(`Owner ${email} created. Sign in and add your team under Team.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
