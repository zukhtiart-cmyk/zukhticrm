CREATE TYPE "public"."approval_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'PAID');--> statement-breakpoint
CREATE TYPE "public"."snag_status" AS ENUM('OPEN', 'FIXED', 'VERIFIED');--> statement-breakpoint
CREATE TYPE "public"."work_order_status" AS ENUM('OPEN', 'DONE', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "contractor_bills" (
	"id" text PRIMARY KEY NOT NULL,
	"work_order_id" text NOT NULL,
	"amount" numeric(16, 2) NOT NULL,
	"note" text,
	"bill_url" text,
	"status" "approval_status" DEFAULT 'PENDING' NOT NULL,
	"submitted_by_id" text,
	"reviewed_by_id" text,
	"reviewed_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contractors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"trade" text NOT NULL,
	"phone" text,
	"office_id" text,
	"rate_notes" text,
	"bank_details" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"stage_id" text,
	"category" text DEFAULT 'Material' NOT NULL,
	"description" text NOT NULL,
	"paid_to" text,
	"amount" numeric(16, 2) NOT NULL,
	"currency" text NOT NULL,
	"bill_url" text,
	"spent_on" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "approval_status" DEFAULT 'PENDING' NOT NULL,
	"submitted_by_id" text NOT NULL,
	"reviewed_by_id" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snags" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"room" text DEFAULT 'General' NOT NULL,
	"description" text NOT NULL,
	"photo_url" text,
	"fixed_photo_url" text,
	"contractor_id" text,
	"status" "snag_status" DEFAULT 'OPEN' NOT NULL,
	"from_client" boolean DEFAULT false NOT NULL,
	"created_by_id" text,
	"fixed_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warranties" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"item" text NOT NULL,
	"brand" text,
	"months" integer DEFAULT 12 NOT NULL,
	"starts_on" timestamp with time zone,
	"doc_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"project_id" text NOT NULL,
	"contractor_id" text NOT NULL,
	"stage_id" text,
	"title" text NOT NULL,
	"scope" text,
	"amount" numeric(16, 2) NOT NULL,
	"currency" text NOT NULL,
	"status" "work_order_status" DEFAULT 'OPEN' NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_orders_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "handed_over_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "amc_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "amc_reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "care_notes" text;--> statement-breakpoint
ALTER TABLE "contractor_bills" ADD CONSTRAINT "contractor_bills_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_bills" ADD CONSTRAINT "contractor_bills_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_bills" ADD CONSTRAINT "contractor_bills_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractors" ADD CONSTRAINT "contractors_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_expenses" ADD CONSTRAINT "site_expenses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_expenses" ADD CONSTRAINT "site_expenses_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_expenses" ADD CONSTRAINT "site_expenses_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_expenses" ADD CONSTRAINT "site_expenses_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snags" ADD CONSTRAINT "snags_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snags" ADD CONSTRAINT "snags_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snags" ADD CONSTRAINT "snags_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;