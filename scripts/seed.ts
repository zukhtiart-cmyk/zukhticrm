/**
 * Demo data so every screen has something to show.
 * Run once on an empty database:  npm run db:seed
 * All demo users share the password printed at the end.
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, clients, leads, leadActivities, offices, orders, projects, rateItems, siteUpdates, stages, users, visits, boqItems, milestones } from "../src/db";
import { createProjectWithDefaults, recomputeProjectProgress, syncMilestoneAmounts } from "../src/lib/projects";

const PASSWORD = "zukhti123";
const days = (n: number) => new Date(Date.now() + n * 86400000);

async function main() {
  const existing = await db.select().from(users).limit(1);
  if (existing.length) {
    console.log("Database already has users — seed skipped.");
    process.exit(0);
  }

  const [mumbai, dubai, china] = await db
    .insert(offices)
    .values([
      { name: "Mumbai HQ", city: "Mumbai", currency: "INR", taxLabel: "GST", taxRate: 18 },
      { name: "Dubai", city: "Dubai", currency: "AED", taxLabel: "VAT", taxRate: 5 },
      { name: "China sourcing", city: "Foshan", currency: "CNY", taxLabel: "VAT", taxRate: 13 },
    ])
    .returning();

  const hash = await bcrypt.hash(PASSWORD, 10);
  const people = await db
    .insert(users)
    .values([
      { name: "Owner", email: "owner@zukhti.com", role: "OWNER", passwordHash: hash, officeId: mumbai.id },
      { name: "Riya (Admin)", email: "admin@zukhti.com", role: "ADMIN", passwordHash: hash, officeId: mumbai.id },
      { name: "Kabir (Designer)", email: "designer@zukhti.com", role: "DESIGNER", passwordHash: hash, officeId: mumbai.id },
      { name: "Ramesh (Site)", email: "site@zukhti.com", role: "SUPERVISOR", passwordHash: hash, officeId: mumbai.id },
      { name: "Li Wei (Procurement)", email: "procurement@zukhti.com", role: "PROCUREMENT", passwordHash: hash, officeId: china.id },
      { name: "Neha (Accounts)", email: "accounts@zukhti.com", role: "ACCOUNTS", passwordHash: hash, officeId: mumbai.id },
      { name: "Omar (Dubai PM)", email: "dubai@zukhti.com", role: "DESIGNER", passwordHash: hash, officeId: dubai.id },
    ])
    .returning();
  const [owner, , designer, supervisor] = people;

  const rates = await db
    .insert(rateItems)
    .values([
      { category: "Carpentry", name: "Modular kitchen — acrylic finish", unit: "rft", cost: 4200, price: 6200 },
      { category: "Carpentry", name: "Wardrobe — laminate, soft-close", unit: "sqft", cost: 1450, price: 2100 },
      { category: "Carpentry", name: "TV unit with fluted panels", unit: "sqft", cost: 1600, price: 2400 },
      { category: "Ceiling", name: "Gypsum false ceiling with cove", unit: "sqft", cost: 95, price: 145 },
      { category: "Electrical", name: "Electrical point (wiring + switch)", unit: "point", cost: 900, price: 1400 },
      { category: "Painting", name: "Premium emulsion, 2 coats", unit: "sqft", cost: 28, price: 45 },
      { category: "Flooring", name: "Italian marble supply + laying", unit: "sqft", cost: 420, price: 620 },
      { category: "Furniture", name: "3-seater sofa (China sourced)", unit: "nos", cost: 85000, price: 145000 },
      { category: "Lighting", name: "Designer pendant light", unit: "nos", cost: 9000, price: 16000 },
    ])
    .returning();

  // Leads across the pipeline
  await db.insert(leads).values([
    { name: "Ananya Kapoor", phone: "+919820000001", source: "Instagram", city: "Mumbai", budgetBand: "Premium (₹40L–1Cr)", propertyType: "Apartment", status: "NEW", officeId: mumbai.id, ownerId: designer.id, nextFollowUpAt: days(0) },
    { name: "Vikram Mehta", phone: "+919820000002", source: "Referral", city: "Mumbai", budgetBand: "Luxury (₹1Cr+)", propertyType: "Penthouse", status: "SITE_VISIT", officeId: mumbai.id, ownerId: designer.id, nextFollowUpAt: days(1) },
    { name: "Sara Al Mansoori", phone: "+971500000003", source: "Website", city: "Dubai", budgetBand: "Luxury (AED 400K+)", propertyType: "Villa", status: "DESIGN", officeId: dubai.id, ownerId: people[6].id, nextFollowUpAt: days(-1) },
    { name: "Rohan Desai", phone: "+919820000004", source: "Architect", city: "Pune", budgetBand: "Mid (₹15–40L)", propertyType: "Apartment", status: "QUOTED", officeId: mumbai.id, ownerId: designer.id, nextFollowUpAt: days(2) },
    { name: "Imran Sheikh", phone: "+919820000005", source: "WhatsApp", city: "Mumbai", budgetBand: "Mid (₹15–40L)", propertyType: "Office", status: "CONTACTED", officeId: mumbai.id, nextFollowUpAt: days(0) },
  ]);

  // A won client with an active project
  const [shah] = await db.insert(clients).values({ name: "Arjun Shah", phone: "+919820011111", email: "arjun@example.com", officeId: mumbai.id }).returning();
  const [lead] = await db
    .insert(leads)
    .values({ name: "Arjun Shah", phone: "+919820011111", source: "Referral", city: "Mumbai", budgetBand: "Premium (₹40L–1Cr)", propertyType: "Apartment", status: "WON", officeId: mumbai.id, ownerId: designer.id, clientId: shah.id })
    .returning();
  await db.insert(leadActivities).values([
    { leadId: lead.id, type: "CALL", summary: "First call — 3BHK in Bandra West, wants a warm modern look", userId: designer.id, at: days(-60) },
    { leadId: lead.id, type: "MEETING", summary: "Site visit and measurements done", userId: designer.id, at: days(-55) },
  ]);

  const project = await createProjectWithDefaults(db, {
    name: "Shah residence, Bandra West",
    clientId: shah.id,
    officeId: mumbai.id,
    siteAddress: "Sea Breeze Tower, Flat 1402, Bandra West, Mumbai",
    managerId: designer.id,
    expectedHandover: days(42),
  });
  await db.update(projects).set({ status: "ACTIVE", startDate: days(-50) }).where(eq(projects.id, project.id));

  const st = await db.select().from(stages).where(eq(stages.projectId, project.id));
  const byName = (n: string) => st.find((s) => s.name === n)!;
  const progress: Record<string, number> = { Design: 100, "Civil & demolition": 100, "Electrical & plumbing": 100, "False ceiling": 100, Carpentry: 60 };
  for (const s of st) {
    const p = progress[s.name] ?? 0;
    await db
      .update(stages)
      .set({ progress: p, status: p === 100 ? "DONE" : p > 0 ? "IN_PROGRESS" : "NOT_STARTED", actualStart: p ? days(-45) : null, actualEnd: p === 100 ? days(-10) : null })
      .where(eq(stages.id, s.id));
  }
  await recomputeProjectProgress(db, project.id);

  const r = (name: string) => rates.find((x) => x.name.startsWith(name))!;
  const boq = [
    { room: "Kitchen", rate: r("Modular kitchen"), qty: 18 },
    { room: "Master bedroom", rate: r("Wardrobe"), qty: 84 },
    { room: "Kids bedroom", rate: r("Wardrobe"), qty: 56 },
    { room: "Living", rate: r("TV unit"), qty: 48 },
    { room: "Living", rate: r("3-seater sofa"), qty: 1 },
    { room: "Living", rate: r("Designer pendant"), qty: 3 },
    { room: "Whole house", rate: r("Gypsum false ceiling"), qty: 1350 },
    { room: "Whole house", rate: r("Electrical point"), qty: 65 },
    { room: "Whole house", rate: r("Premium emulsion"), qty: 4200 },
  ];
  await db.insert(boqItems).values(
    boq.map((b) => ({ projectId: project.id, room: b.room, description: b.rate.name, unit: b.rate.unit, qty: b.qty, unitCost: b.rate.cost, unitPrice: b.rate.price, rateItemId: b.rate.id })),
  );
  await syncMilestoneAmounts(db, project.id, 18);
  const ms = await db.select().from(milestones).where(eq(milestones.projectId, project.id));
  for (const m of ms.filter((m) => m.sortOrder < 3)) {
    await db.update(milestones).set({ status: "PAID", paidAmount: m.amount, paidAt: days(-40 + m.sortOrder * 10), reference: "NEFT" }).where(eq(milestones.id, m.id));
  }

  await db.insert(orders).values([
    { projectId: project.id, item: "3-seater sofa", vendor: "Foshan Living Co.", status: "SHIPPED", eta: days(17) },
    { projectId: project.id, item: "Designer pendant lights (3)", vendor: "Zhongshan Lighting", status: "IN_PRODUCTION", eta: days(30) },
  ]);
  await db.insert(visits).values({ projectId: project.id, title: "Client walkthrough — carpentry", at: days(3) });
  await db.insert(siteUpdates).values([
    { projectId: project.id, stageId: byName("False ceiling").id, authorId: supervisor.id, summary: "False ceiling completed in all rooms, cove lights wired.", sentToClient: true, sendStatus: "demo", createdAt: days(-10) },
    { projectId: project.id, stageId: byName("Carpentry").id, authorId: supervisor.id, summary: "Kitchen and wardrobe carcasses installed; laminate work starts Monday.", issues: "Hinges for kids wardrobe pending from vendor", createdAt: days(-1) },
  ]);

  // A Dubai project in design
  const [sara] = await db.insert(clients).values({ name: "Khalid Al Nuaimi", phone: "+971500000099", officeId: dubai.id, language: "ar" }).returning();
  await createProjectWithDefaults(db, { name: "Al Nuaimi villa, Jumeirah", clientId: sara.id, officeId: dubai.id, managerId: people[6].id, expectedHandover: days(150) });

  console.log(`Seeded. Sign in with owner@zukhti.com / ${PASSWORD} (also admin@, designer@, site@, procurement@, accounts@, dubai@).`);
  console.log("Owner id:", owner.id);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
