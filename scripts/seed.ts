/**
 * Demo data so every screen has something to show.
 * Run once on an empty database:  npm run db:seed
 * All demo users share the password printed at the end.
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, clients, contractorBills, contractors, siteExpenses, snags, warranties, workOrders, designs, vendors, leads, leadActivities, offices, orders, projects, rateItems, siteUpdates, stages, users, visits, boqItems, milestones } from "../src/db";
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
    await db
      .update(milestones)
      .set({ status: "PAID", paidAmount: m.amount, paidAt: days(-40 + m.sortOrder * 10), reference: "NEFT", invoiceNumber: `MUM-${new Date().getFullYear()}-000${m.sortOrder + 1}`, invoicedAt: days(-42 + m.sortOrder * 10) })
      .where(eq(milestones.id, m.id));
  }
  await db.update(clients).set({ portalToken: "demo-shah-portal-link-0123456789" }).where(eq(clients.id, shah.id));
  const render = "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1200&q=80";
  await db.insert(designs).values([
    { projectId: project.id, room: "Living", title: "TV wall — 3D view", version: 1, fileUrl: render, fileType: "image", status: "CHANGES_REQUESTED", clientComment: "Can the fluted panel be darker?", decidedAt: days(-20), sharedAt: days(-22), uploadedById: designer.id, createdAt: days(-22) },
    { projectId: project.id, room: "Living", title: "TV wall — 3D view", version: 2, fileUrl: render, fileType: "image", notes: "Darker walnut fluting as requested", status: "PENDING", sharedAt: days(-1), uploadedById: designer.id, createdAt: days(-1) },
    { projectId: project.id, room: "Kitchen", title: "Kitchen elevation", version: 1, fileUrl: render, fileType: "image", status: "APPROVED", decidedAt: days(-30), sharedAt: days(-32), uploadedById: designer.id, createdAt: days(-32) },
  ]);

  const [foshan, zhongshan] = await db
    .insert(vendors)
    .values([
      { name: "Foshan Living Co.", country: "China", city: "Foshan", category: "Furniture", contactName: "Mr. Chen", phone: "+86 138 0000 0001", currency: "CNY", leadTimeDays: 45 },
      { name: "Zhongshan Lighting", country: "China", city: "Zhongshan", category: "Lighting", contactName: "Ms. Lin", currency: "CNY", leadTimeDays: 35 },
      { name: "Kajaria Stone Works", country: "India", city: "Mumbai", category: "Stone & tiles", currency: "INR", leadTimeDays: 10 },
    ])
    .returning();
  const projectLines = await db.select().from(boqItems).where(eq(boqItems.projectId, project.id));
  const sofaLine = projectLines.find((b) => b.description.startsWith("3-seater"))!;
  const pendantLine = projectLines.find((b) => b.description.startsWith("Designer pendant"))!;
  await db.insert(orders).values([
    { projectId: project.id, item: "Living: 3-seater sofa (China sourced)", vendor: foshan.name, vendorId: foshan.id, poNumber: `PO-${new Date().getFullYear()}-0001`, boqItemId: sofaLine.id, qty: 1, unit: "nos", unitCost: 6800, currency: "CNY", fxRate: 12, status: "SHIPPED", orderedAt: days(-40), shippedAt: days(-5), containerNo: "MSKU1234567", port: "Nhava Sheva", eta: days(17) },
    { projectId: project.id, item: "Designer pendant lights (3)", vendor: zhongshan.name, vendorId: zhongshan.id, poNumber: `PO-${new Date().getFullYear()}-0002`, boqItemId: pendantLine.id, qty: 3, unit: "nos", unitCost: 650, currency: "CNY", fxRate: 12, status: "IN_PRODUCTION", orderedAt: days(-20), eta: days(30) },
  ]);
  await db.insert(visits).values({ projectId: project.id, title: "Client walkthrough — carpentry", at: days(3) });
  await db.insert(siteUpdates).values([
    { projectId: project.id, stageId: byName("False ceiling").id, authorId: supervisor.id, summary: "False ceiling completed in all rooms, cove lights wired.", clientMessage: "Hi Arjun, the false ceiling is now complete in all rooms and the cove lights are wired. Carpentry starts this week!", sentToClient: true, sendStatus: "demo", createdAt: days(-10) },
    { projectId: project.id, stageId: byName("Carpentry").id, authorId: supervisor.id, summary: "Kitchen and wardrobe carcasses installed; laminate work starts Monday.", issues: "Hinges for kids wardrobe pending from vendor", createdAt: days(-1) },
  ]);

  // Site costs: contractors, work orders with running bills, cash expenses
  const [ramesh, sunil] = await db
    .insert(contractors)
    .values([
      { name: "Ramesh Carpentry Works", trade: "Carpenter", phone: "+919820055501", officeId: mumbai.id, rateNotes: "Wardrobe ₹450/sqft labour · kitchen ₹900/rft", bankDetails: "UPI rameshcw@okicici" },
      { name: "Sunil Painting Contractors", trade: "Painter", phone: "+919820055502", officeId: mumbai.id, rateNotes: "Royale emulsion ₹28/sqft incl. putty" },
      { name: "Bright Electricals", trade: "Electrician", phone: "+919820055503", officeId: mumbai.id },
    ])
    .returning();
  const [woCarp] = await db
    .insert(workOrders)
    .values([
      { number: `WO-${new Date().getFullYear()}-0001`, projectId: project.id, contractorId: ramesh.id, stageId: byName("Carpentry").id, title: "Wardrobes, kitchen & TV unit — labour", scope: "3 wardrobes (7×8 ft), L-kitchen 14 rft, TV unit. Material by Zukhti. 35 working days.", amount: 185000, currency: "INR", createdById: supervisor.id, createdAt: days(-30) },
      { number: `WO-${new Date().getFullYear()}-0002`, projectId: project.id, contractorId: sunil.id, stageId: byName("Painting & finishes").id, title: "Full house painting", scope: "Putty, primer, 2 coats Royale. Approx 4200 sqft.", amount: 118000, currency: "INR", createdById: supervisor.id, createdAt: days(-5) },
    ])
    .returning();
  await db.insert(contractorBills).values([
    { workOrderId: woCarp.id, amount: 60000, note: "RA1 — carcasses for 3 wardrobes", status: "PAID", submittedById: supervisor.id, paidAt: days(-12), reference: "UTR 4413", createdAt: days(-14) },
    { workOrderId: woCarp.id, amount: 45000, note: "RA2 — kitchen carcass and shutters", status: "PENDING", submittedById: supervisor.id, createdAt: days(-1) },
  ]);
  await db.insert(siteExpenses).values([
    { projectId: project.id, category: "Material", description: "20 bags white cement + tile adhesive", paidTo: "Kurla Hardware", amount: 8400, currency: "INR", status: "APPROVED", submittedById: supervisor.id, reviewedById: people[5].id, reviewedAt: days(-6), spentOn: days(-7) },
    { projectId: project.id, category: "Transport", description: "Tempo — laminate sheets from godown", paidTo: "Raju tempo", amount: 1800, currency: "INR", status: "PENDING", submittedById: supervisor.id, spentOn: days(-1) },
    { projectId: project.id, category: "Tools & consumables", description: "Drill bits, screws, fevicol", amount: 2350, currency: "INR", status: "PENDING", submittedById: supervisor.id, spentOn: days(0) },
  ]);
  await db.insert(snags).values([
    { projectId: project.id, room: "Kitchen", description: "Corner carousel shutter rubbing against the hob panel", contractorId: ramesh.id, createdById: supervisor.id },
    { projectId: project.id, room: "Master bedroom", description: "Cove light flickering on the window side", createdById: designer.id },
  ]);

  // A finished project — handover pack, warranties and maintenance reminder
  const [mehta] = await db.insert(clients).values({ name: "Neha Mehta", phone: "+919820022222", officeId: mumbai.id }).returning();
  const done = await createProjectWithDefaults(db, { name: "Mehta apartment, Powai", clientId: mehta.id, officeId: mumbai.id, managerId: designer.id, siteAddress: "Hiranandani Gardens, Powai", expectedHandover: days(-20) });
  await db.update(stages).set({ status: "DONE", progress: 100 }).where(eq(stages.projectId, done.id));
  await db.update(projects).set({ status: "HANDED_OVER", progress: 100, startDate: days(-140), handedOverAt: days(-20), amcDueAt: days(345) }).where(eq(projects.id, done.id));
  await db.insert(warranties).values([
    { projectId: done.id, item: "Hob & chimney", brand: "Faber", months: 24, startsOn: days(-20), notes: "Register on faberindia.com with the invoice" },
    { projectId: done.id, item: "Soft-close hinges & channels", brand: "Hettich", months: 120, startsOn: days(-20) },
    { projectId: done.id, item: "Workmanship (carpentry & ceiling)", brand: "Zukhti Home", months: 12, startsOn: days(-20) },
  ]);
  await db.insert(snags).values([
    { projectId: done.id, room: "Living", description: "Paint touch-up near TV unit", status: "VERIFIED", fixedAt: days(-22), verifiedAt: days(-21), createdById: supervisor.id, createdAt: days(-25) },
    { projectId: done.id, room: "Kids bedroom", description: "Study table drawer is stiff", fromClient: true, createdAt: days(-2) },
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
