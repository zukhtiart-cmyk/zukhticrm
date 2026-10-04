import { relations } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const money = (name: string) => numeric(name, { precision: 16, scale: 2, mode: "number" });
const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum("role", ["OWNER", "ADMIN", "DESIGNER", "SUPERVISOR", "PROCUREMENT", "ACCOUNTS"]);
export const leadStatusEnum = pgEnum("lead_status", ["NEW", "CONTACTED", "SITE_VISIT", "DESIGN", "QUOTED", "WON", "LOST"]);
export const projectStatusEnum = pgEnum("project_status", ["DESIGN", "ACTIVE", "ON_HOLD", "HANDED_OVER"]);
export const stageStatusEnum = pgEnum("stage_status", ["NOT_STARTED", "IN_PROGRESS", "DONE"]);
export const milestoneStatusEnum = pgEnum("milestone_status", ["PENDING", "INVOICED", "PAID"]);
export const orderStatusEnum = pgEnum("order_status", ["ORDERED", "IN_PRODUCTION", "SHIPPED", "CUSTOMS", "DELIVERED"]);
export const quoteStatusEnum = pgEnum("quote_status", ["DRAFT", "SENT", "ACCEPTED"]);
export const updateSourceEnum = pgEnum("update_source", ["VOICE", "MANUAL"]);
export const designStatusEnum = pgEnum("design_status", ["DRAFT", "PENDING", "APPROVED", "CHANGES_REQUESTED"]);
export const waDirectionEnum = pgEnum("wa_direction", ["IN", "OUT"]);
export const waStatusEnum = pgEnum("wa_status", ["RECEIVED", "AUTO_REPLIED", "NEEDS_HUMAN", "PENDING_APPROVAL", "SENT", "QUEUED", "FAILED", "DISCARDED"]);

export const approvalStatusEnum = pgEnum("approval_status", ["PENDING", "APPROVED", "REJECTED", "PAID"]);
export const workOrderStatusEnum = pgEnum("work_order_status", ["OPEN", "DONE", "CANCELLED"]);
export const snagStatusEnum = pgEnum("snag_status", ["OPEN", "FIXED", "VERIFIED"]);

export type Role = (typeof roleEnum.enumValues)[number];
export type LeadStatus = (typeof leadStatusEnum.enumValues)[number];
export type StageStatus = (typeof stageStatusEnum.enumValues)[number];
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];
export type DesignStatus = (typeof designStatusEnum.enumValues)[number];
export type WaStatus = (typeof waStatusEnum.enumValues)[number];

export const offices = pgTable("offices", {
  id: id(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  currency: text("currency").notNull().default("INR"),
  taxLabel: text("tax_label").notNull().default("GST"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2, mode: "number" }).notNull().default(18),
  createdAt: created(),
});

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
  phone: text("phone"),
  active: boolean("active").notNull().default(true),
  officeId: text("office_id").references(() => offices.id),
  createdAt: created(),
});

export const clients = pgTable("clients", {
  id: id(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  language: text("language").notNull().default("en"),
  officeId: text("office_id")
    .notNull()
    .references(() => offices.id),
  /** Secret part of the client's portal link; null = portal not enabled. */
  portalToken: text("portal_token").unique(),
  portalLastSeenAt: timestamp("portal_last_seen_at", { withTimezone: true }),
  createdAt: created(),
});

export const leads = pgTable("leads", {
  id: id(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  source: text("source").notNull().default("Website"),
  city: text("city"),
  budgetBand: text("budget_band"),
  propertyType: text("property_type"),
  status: leadStatusEnum("status").notNull().default("NEW"),
  nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
  notes: text("notes"),
  officeId: text("office_id")
    .notNull()
    .references(() => offices.id),
  ownerId: text("owner_id").references(() => users.id),
  clientId: text("client_id").references(() => clients.id),
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const leadActivities = pgTable("lead_activities", {
  id: id(),
  leadId: text("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  summary: text("summary").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  userId: text("user_id").references(() => users.id),
});

export const projects = pgTable("projects", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  siteAddress: text("site_address"),
  status: projectStatusEnum("status").notNull().default("DESIGN"),
  progress: integer("progress").notNull().default(0),
  startDate: timestamp("start_date", { withTimezone: true }),
  expectedHandover: timestamp("expected_handover", { withTimezone: true }),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  officeId: text("office_id")
    .notNull()
    .references(() => offices.id),
  managerId: text("manager_id").references(() => users.id),
  /** Site location, for suggesting the nearest project on the Voice Desk. */
  siteLat: doublePrecision("site_lat"),
  siteLng: doublePrecision("site_lng"),
  /** Handover: set when marked handed over; AMC reminder goes to the client on amcDueAt. */
  handedOverAt: timestamp("handed_over_at", { withTimezone: true }),
  amcDueAt: timestamp("amc_due_at", { withTimezone: true }),
  amcRemindedAt: timestamp("amc_reminded_at", { withTimezone: true }),
  careNotes: text("care_notes"),
  createdAt: created(),
});

export const stages = pgTable("stages", {
  id: id(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  order: integer("order").notNull(),
  status: stageStatusEnum("status").notNull().default("NOT_STARTED"),
  progress: integer("progress").notNull().default(0),
  plannedEnd: timestamp("planned_end", { withTimezone: true }),
  actualStart: timestamp("actual_start", { withTimezone: true }),
  actualEnd: timestamp("actual_end", { withTimezone: true }),
});

export const siteUpdates = pgTable("site_updates", {
  id: id(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  stageId: text("stage_id").references(() => stages.id, { onDelete: "set null" }),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  source: updateSourceEnum("source").notNull().default("MANUAL"),
  transcript: text("transcript"),
  audioUrl: text("audio_url"),
  summary: text("summary").notNull(),
  issues: text("issues"),
  changes: jsonb("changes").$type<string[]>(),
  clientMessage: text("client_message"),
  sentToClient: boolean("sent_to_client").notNull().default(false),
  sendStatus: text("send_status"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: created(),
});

export const photos = pgTable("photos", {
  id: id(),
  url: text("url").notNull(),
  caption: text("caption"),
  clientVisible: boolean("client_visible").notNull().default(false),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  updateId: text("update_id").references(() => siteUpdates.id, { onDelete: "set null" }),
  createdAt: created(),
});

export const rateItems = pgTable("rate_items", {
  id: id(),
  category: text("category").notNull(),
  name: text("name").notNull(),
  unit: text("unit").notNull(),
  cost: money("cost").notNull(),
  price: money("price").notNull(),
  currency: text("currency").notNull().default("INR"),
});

export const boqItems = pgTable("boq_items", {
  id: id(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  room: text("room").notNull(),
  description: text("description").notNull(),
  unit: text("unit").notNull(),
  qty: numeric("qty", { precision: 12, scale: 2, mode: "number" }).notNull(),
  unitCost: money("unit_cost").notNull(),
  unitPrice: money("unit_price").notNull(),
  rateItemId: text("rate_item_id").references(() => rateItems.id, { onDelete: "set null" }),
  createdAt: created(),
});

export type QuoteLine = { room: string; description: string; unit: string; qty: number; unitPrice: number; amount: number };

export const quotes = pgTable(
  "quotes",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: quoteStatusEnum("status").notNull().default("DRAFT"),
    currency: text("currency").notNull(),
    taxLabel: text("tax_label").notNull(),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2, mode: "number" }).notNull(),
    subtotal: money("subtotal").notNull(),
    tax: money("tax").notNull(),
    total: money("total").notNull(),
    lines: jsonb("lines").$type<QuoteLine[]>().notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("quotes_project_version").on(t.projectId, t.version)],
);

export const milestones = pgTable("payment_milestones", {
  id: id(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  percent: numeric("percent", { precision: 5, scale: 2, mode: "number" }).notNull(),
  amount: money("amount").notNull(),
  dueStageId: text("due_stage_id").references(() => stages.id, { onDelete: "set null" }),
  status: milestoneStatusEnum("status").notNull().default("PENDING"),
  paidAmount: money("paid_amount"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  reference: text("reference"),
  invoiceNumber: text("invoice_number").unique(),
  invoicedAt: timestamp("invoiced_at", { withTimezone: true }),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const orders = pgTable("purchase_orders", {
  id: id(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  item: text("item").notNull(),
  /** Free-text vendor name (orders recorded by voice); vendorId when chosen from the vendor list. */
  vendor: text("vendor"),
  vendorId: text("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
  /** Lines created together share one PO number, e.g. PO-2026-0012. */
  poNumber: text("po_number"),
  boqItemId: text("boq_item_id").references(() => boqItems.id, { onDelete: "set null" }),
  qty: numeric("qty", { precision: 12, scale: 2, mode: "number" }),
  unit: text("unit"),
  /** Cost per unit in the vendor's currency. */
  unitCost: money("unit_cost"),
  currency: text("currency"),
  /** 1 unit of order currency = fxRate units of the project's currency, fixed when the PO is raised. */
  fxRate: numeric("fx_rate", { precision: 14, scale: 6, mode: "number" }),
  status: orderStatusEnum("status").notNull().default("ORDERED"),
  eta: timestamp("eta", { withTimezone: true }),
  orderedAt: timestamp("ordered_at", { withTimezone: true }),
  shippedAt: timestamp("shipped_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  containerNo: text("container_no"),
  port: text("port"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const vendors = pgTable("vendors", {
  id: id(),
  name: text("name").notNull(),
  country: text("country").notNull().default("China"),
  city: text("city"),
  category: text("category"),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  currency: text("currency").notNull().default("CNY"),
  leadTimeDays: integer("lead_time_days"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: created(),
});

/** Evening summary of the day across all sites (one per day). */
export const dailyReports = pgTable("daily_reports", {
  id: id(),
  day: text("day").notNull().unique(),
  body: text("body").notNull(),
  createdAt: created(),
});

export const visits = pgTable("site_visits", {
  id: id(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull(),
  notes: text("notes"),
});

export const designs = pgTable("designs", {
  id: id(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  room: text("room").notNull(),
  title: text("title").notNull(),
  version: integer("version").notNull().default(1),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type").notNull(),
  notes: text("notes"),
  /** DRAFT = internal only; PENDING = shared, waiting for the client. */
  status: designStatusEnum("status").notNull().default("DRAFT"),
  clientComment: text("client_comment"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  sharedAt: timestamp("shared_at", { withTimezone: true }),
  uploadedById: text("uploaded_by_id").references(() => users.id),
  createdAt: created(),
});

/** One WhatsApp conversation per phone number (client, lead or unknown). */
export const conversations = pgTable("wa_conversations", {
  id: id(),
  /** Digits only, with country code, as WhatsApp sends it, e.g. 919820011111 */
  phone: text("phone").notNull().unique(),
  name: text("name"),
  clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
  leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
  activeProjectId: text("active_project_id").references(() => projects.id, { onDelete: "set null" }),
  awaitingProjectChoice: boolean("awaiting_project_choice").notNull().default(false),
  /** Set when handed to a person; the assistant stays quiet until staff resume it. */
  aiPaused: boolean("ai_paused").notNull().default(false),
  needsHuman: boolean("needs_human").notNull().default(false),
  /** Free-form WhatsApp messages are only allowed within 24 hours of this. */
  lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: created(),
});

export const waMessages = pgTable("wa_messages", {
  id: id(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  direction: waDirectionEnum("direction").notNull(),
  /** WhatsApp's message id; unique so a retried webhook is processed once. */
  waMessageId: text("wa_message_id").unique(),
  kind: text("kind").notNull().default("text"),
  body: text("body").notNull().default(""),
  mediaUrl: text("media_url"),
  intent: text("intent"),
  status: waStatusEnum("status").notNull(),
  authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
  error: text("error"),
  createdAt: created(),
});

/** Small key/value store for app settings (WhatsApp mode, weekly summaries…). */
export const settings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Cash spent on site (material top-ups, transport, tools, small labour) — submitted from the desk, approved by accounts. */
export const siteExpenses = pgTable("site_expenses", {
  id: id(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  stageId: text("stage_id").references(() => stages.id, { onDelete: "set null" }),
  category: text("category").notNull().default("Material"),
  description: text("description").notNull(),
  paidTo: text("paid_to"),
  amount: money("amount").notNull(),
  /** Always the project office's currency. */
  currency: text("currency").notNull(),
  billUrl: text("bill_url"),
  spentOn: timestamp("spent_on", { withTimezone: true }).notNull().defaultNow(),
  status: approvalStatusEnum("status").notNull().default("PENDING"),
  submittedById: text("submitted_by_id")
    .notNull()
    .references(() => users.id),
  reviewedById: text("reviewed_by_id").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewNote: text("review_note"),
  createdAt: created(),
});

/** Carpenters, painters, electricians and other site contractors. */
export const contractors = pgTable("contractors", {
  id: id(),
  name: text("name").notNull(),
  trade: text("trade").notNull(),
  phone: text("phone"),
  officeId: text("office_id").references(() => offices.id),
  rateNotes: text("rate_notes"),
  bankDetails: text("bank_details"),
  active: boolean("active").notNull().default(true),
  createdAt: created(),
});

/** Agreed scope and value for one contractor on one project. */
export const workOrders = pgTable("work_orders", {
  id: id(),
  number: text("number").notNull().unique(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  contractorId: text("contractor_id")
    .notNull()
    .references(() => contractors.id),
  stageId: text("stage_id").references(() => stages.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  scope: text("scope"),
  amount: money("amount").notNull(),
  currency: text("currency").notNull(),
  status: workOrderStatusEnum("status").notNull().default("OPEN"),
  createdById: text("created_by_id").references(() => users.id),
  createdAt: created(),
});

/** Running bills against a work order: submitted → approved → paid. */
export const contractorBills = pgTable("contractor_bills", {
  id: id(),
  workOrderId: text("work_order_id")
    .notNull()
    .references(() => workOrders.id, { onDelete: "cascade" }),
  amount: money("amount").notNull(),
  note: text("note"),
  billUrl: text("bill_url"),
  status: approvalStatusEnum("status").notNull().default("PENDING"),
  submittedById: text("submitted_by_id").references(() => users.id),
  reviewedById: text("reviewed_by_id").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  reference: text("reference"),
  createdAt: created(),
});

/** Punch-list items before (and after) handover. */
export const snags = pgTable("snags", {
  id: id(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  room: text("room").notNull().default("General"),
  description: text("description").notNull(),
  photoUrl: text("photo_url"),
  fixedPhotoUrl: text("fixed_photo_url"),
  contractorId: text("contractor_id").references(() => contractors.id, { onDelete: "set null" }),
  status: snagStatusEnum("status").notNull().default("OPEN"),
  /** Raised by the client from the portal. */
  fromClient: boolean("from_client").notNull().default(false),
  createdById: text("created_by_id").references(() => users.id),
  fixedAt: timestamp("fixed_at", { withTimezone: true }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: created(),
});

/** Warranties handed to the client (appliances, hardware, waterproofing…). */
export const warranties = pgTable("warranties", {
  id: id(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  item: text("item").notNull(),
  brand: text("brand"),
  months: integer("months").notNull().default(12),
  startsOn: timestamp("starts_on", { withTimezone: true }),
  docUrl: text("doc_url"),
  notes: text("notes"),
  createdAt: created(),
});

// Relations
export const officesRelations = relations(offices, ({ many }) => ({ users: many(users), projects: many(projects) }));
export const usersRelations = relations(users, ({ one }) => ({ office: one(offices, { fields: [users.officeId], references: [offices.id] }) }));
export const clientsRelations = relations(clients, ({ one, many }) => ({
  office: one(offices, { fields: [clients.officeId], references: [offices.id] }),
  projects: many(projects),
}));
export const leadsRelations = relations(leads, ({ one, many }) => ({
  office: one(offices, { fields: [leads.officeId], references: [offices.id] }),
  owner: one(users, { fields: [leads.ownerId], references: [users.id] }),
  client: one(clients, { fields: [leads.clientId], references: [clients.id] }),
  activities: many(leadActivities),
}));
export const leadActivitiesRelations = relations(leadActivities, ({ one }) => ({
  lead: one(leads, { fields: [leadActivities.leadId], references: [leads.id] }),
  user: one(users, { fields: [leadActivities.userId], references: [users.id] }),
}));
export const projectsRelations = relations(projects, ({ one, many }) => ({
  client: one(clients, { fields: [projects.clientId], references: [clients.id] }),
  office: one(offices, { fields: [projects.officeId], references: [offices.id] }),
  manager: one(users, { fields: [projects.managerId], references: [users.id] }),
  stages: many(stages),
  updates: many(siteUpdates),
  photos: many(photos),
  boqItems: many(boqItems),
  quotes: many(quotes),
  milestones: many(milestones),
  orders: many(orders),
  visits: many(visits),
  designs: many(designs),
  expenses: many(siteExpenses),
  workOrders: many(workOrders),
  snags: many(snags),
  warranties: many(warranties),
}));
export const stagesRelations = relations(stages, ({ one }) => ({ project: one(projects, { fields: [stages.projectId], references: [projects.id] }) }));
export const siteUpdatesRelations = relations(siteUpdates, ({ one, many }) => ({
  project: one(projects, { fields: [siteUpdates.projectId], references: [projects.id] }),
  stage: one(stages, { fields: [siteUpdates.stageId], references: [stages.id] }),
  author: one(users, { fields: [siteUpdates.authorId], references: [users.id] }),
  photos: many(photos),
}));
export const photosRelations = relations(photos, ({ one }) => ({
  project: one(projects, { fields: [photos.projectId], references: [projects.id] }),
  update: one(siteUpdates, { fields: [photos.updateId], references: [siteUpdates.id] }),
}));
export const boqItemsRelations = relations(boqItems, ({ one, many }) => ({
  project: one(projects, { fields: [boqItems.projectId], references: [projects.id] }),
  orders: many(orders),
}));
export const quotesRelations = relations(quotes, ({ one }) => ({ project: one(projects, { fields: [quotes.projectId], references: [projects.id] }) }));
export const milestonesRelations = relations(milestones, ({ one }) => ({
  project: one(projects, { fields: [milestones.projectId], references: [projects.id] }),
  dueStage: one(stages, { fields: [milestones.dueStageId], references: [stages.id] }),
}));
export const ordersRelations = relations(orders, ({ one }) => ({
  project: one(projects, { fields: [orders.projectId], references: [projects.id] }),
  vendorRef: one(vendors, { fields: [orders.vendorId], references: [vendors.id] }),
  boqItem: one(boqItems, { fields: [orders.boqItemId], references: [boqItems.id] }),
}));
export const vendorsRelations = relations(vendors, ({ many }) => ({ orders: many(orders) }));
export const visitsRelations = relations(visits, ({ one }) => ({ project: one(projects, { fields: [visits.projectId], references: [projects.id] }) }));
export const designsRelations = relations(designs, ({ one }) => ({
  project: one(projects, { fields: [designs.projectId], references: [projects.id] }),
  uploadedBy: one(users, { fields: [designs.uploadedById], references: [users.id] }),
}));
export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  client: one(clients, { fields: [conversations.clientId], references: [clients.id] }),
  lead: one(leads, { fields: [conversations.leadId], references: [leads.id] }),
  activeProject: one(projects, { fields: [conversations.activeProjectId], references: [projects.id] }),
  messages: many(waMessages),
}));
export const waMessagesRelations = relations(waMessages, ({ one }) => ({
  conversation: one(conversations, { fields: [waMessages.conversationId], references: [conversations.id] }),
  author: one(users, { fields: [waMessages.authorId], references: [users.id] }),
}));
export const siteExpensesRelations = relations(siteExpenses, ({ one }) => ({
  project: one(projects, { fields: [siteExpenses.projectId], references: [projects.id] }),
  stage: one(stages, { fields: [siteExpenses.stageId], references: [stages.id] }),
  submittedBy: one(users, { fields: [siteExpenses.submittedById], references: [users.id] }),
  reviewedBy: one(users, { fields: [siteExpenses.reviewedById], references: [users.id] }),
}));
export const contractorsRelations = relations(contractors, ({ one, many }) => ({
  office: one(offices, { fields: [contractors.officeId], references: [offices.id] }),
  workOrders: many(workOrders),
}));
export const workOrdersRelations = relations(workOrders, ({ one, many }) => ({
  project: one(projects, { fields: [workOrders.projectId], references: [projects.id] }),
  contractor: one(contractors, { fields: [workOrders.contractorId], references: [contractors.id] }),
  stage: one(stages, { fields: [workOrders.stageId], references: [stages.id] }),
  bills: many(contractorBills),
}));
export const contractorBillsRelations = relations(contractorBills, ({ one }) => ({
  workOrder: one(workOrders, { fields: [contractorBills.workOrderId], references: [workOrders.id] }),
  submittedBy: one(users, { fields: [contractorBills.submittedById], references: [users.id] }),
}));
export const snagsRelations = relations(snags, ({ one }) => ({
  project: one(projects, { fields: [snags.projectId], references: [projects.id] }),
  contractor: one(contractors, { fields: [snags.contractorId], references: [contractors.id] }),
  createdBy: one(users, { fields: [snags.createdById], references: [users.id] }),
}));
export const warrantiesRelations = relations(warranties, ({ one }) => ({ project: one(projects, { fields: [warranties.projectId], references: [projects.id] }) }));
