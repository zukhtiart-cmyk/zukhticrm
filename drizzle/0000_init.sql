CREATE TYPE "public"."lead_status" AS ENUM('NEW', 'CONTACTED', 'SITE_VISIT', 'DESIGN', 'QUOTED', 'WON', 'LOST');--> statement-breakpoint
CREATE TYPE "public"."milestone_status" AS ENUM('PENDING', 'INVOICED', 'PAID');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('ORDERED', 'IN_PRODUCTION', 'SHIPPED', 'CUSTOMS', 'DELIVERED');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('DESIGN', 'ACTIVE', 'ON_HOLD', 'HANDED_OVER');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('DRAFT', 'SENT', 'ACCEPTED');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('OWNER', 'ADMIN', 'DESIGNER', 'SUPERVISOR', 'PROCUREMENT', 'ACCOUNTS');--> statement-breakpoint
CREATE TYPE "public"."stage_status" AS ENUM('NOT_STARTED', 'IN_PROGRESS', 'DONE');--> statement-breakpoint
CREATE TYPE "public"."update_source" AS ENUM('VOICE', 'MANUAL');--> statement-breakpoint
CREATE TABLE "boq_items" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"room" text NOT NULL,
	"description" text NOT NULL,
	"unit" text NOT NULL,
	"qty" numeric(12, 2) NOT NULL,
	"unit_cost" numeric(16, 2) NOT NULL,
	"unit_price" numeric(16, 2) NOT NULL,
	"rate_item_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"language" text DEFAULT 'en' NOT NULL,
	"office_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"type" text NOT NULL,
	"summary" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"source" text DEFAULT 'Website' NOT NULL,
	"city" text,
	"budget_band" text,
	"property_type" text,
	"status" "lead_status" DEFAULT 'NEW' NOT NULL,
	"next_follow_up_at" timestamp with time zone,
	"notes" text,
	"office_id" text NOT NULL,
	"owner_id" text,
	"client_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_milestones" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"label" text NOT NULL,
	"percent" numeric(5, 2) NOT NULL,
	"amount" numeric(16, 2) NOT NULL,
	"due_stage_id" text,
	"status" "milestone_status" DEFAULT 'PENDING' NOT NULL,
	"paid_amount" numeric(16, 2),
	"paid_at" timestamp with time zone,
	"reference" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offices" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"tax_label" text DEFAULT 'GST' NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT 18 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"item" text NOT NULL,
	"vendor" text,
	"status" "order_status" DEFAULT 'ORDERED' NOT NULL,
	"eta" timestamp with time zone,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"caption" text,
	"client_visible" boolean DEFAULT false NOT NULL,
	"project_id" text NOT NULL,
	"update_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"site_address" text,
	"status" "project_status" DEFAULT 'DESIGN' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"start_date" timestamp with time zone,
	"expected_handover" timestamp with time zone,
	"client_id" text NOT NULL,
	"office_id" text NOT NULL,
	"manager_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" "quote_status" DEFAULT 'DRAFT' NOT NULL,
	"currency" text NOT NULL,
	"tax_label" text NOT NULL,
	"tax_rate" numeric(5, 2) NOT NULL,
	"subtotal" numeric(16, 2) NOT NULL,
	"tax" numeric(16, 2) NOT NULL,
	"total" numeric(16, 2) NOT NULL,
	"lines" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_items" (
	"id" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"cost" numeric(16, 2) NOT NULL,
	"price" numeric(16, 2) NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"stage_id" text,
	"author_id" text NOT NULL,
	"source" "update_source" DEFAULT 'MANUAL' NOT NULL,
	"transcript" text,
	"summary" text NOT NULL,
	"issues" text,
	"changes" jsonb,
	"client_message" text,
	"sent_to_client" boolean DEFAULT false NOT NULL,
	"send_status" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stages" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"order" integer NOT NULL,
	"status" "stage_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"planned_end" timestamp with time zone,
	"actual_start" timestamp with time zone,
	"actual_end" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" NOT NULL,
	"phone" text,
	"active" boolean DEFAULT true NOT NULL,
	"office_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "site_visits" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_rate_item_id_rate_items_id_fk" FOREIGN KEY ("rate_item_id") REFERENCES "public"."rate_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_milestones" ADD CONSTRAINT "payment_milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_milestones" ADD CONSTRAINT "payment_milestones_due_stage_id_stages_id_fk" FOREIGN KEY ("due_stage_id") REFERENCES "public"."stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_update_id_site_updates_id_fk" FOREIGN KEY ("update_id") REFERENCES "public"."site_updates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_updates" ADD CONSTRAINT "site_updates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_updates" ADD CONSTRAINT "site_updates_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_updates" ADD CONSTRAINT "site_updates_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_project_version" ON "quotes" USING btree ("project_id","version");