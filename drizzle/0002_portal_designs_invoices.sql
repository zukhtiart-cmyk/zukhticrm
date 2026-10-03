CREATE TYPE "public"."design_status" AS ENUM('DRAFT', 'PENDING', 'APPROVED', 'CHANGES_REQUESTED');--> statement-breakpoint
CREATE TABLE "designs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"room" text NOT NULL,
	"title" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"file_url" text NOT NULL,
	"file_type" text NOT NULL,
	"notes" text,
	"status" "design_status" DEFAULT 'DRAFT' NOT NULL,
	"client_comment" text,
	"decided_at" timestamp with time zone,
	"shared_at" timestamp with time zone,
	"uploaded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "portal_token" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "portal_last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_milestones" ADD COLUMN "invoice_number" text;--> statement-breakpoint
ALTER TABLE "payment_milestones" ADD COLUMN "invoiced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_portal_token_unique" UNIQUE("portal_token");--> statement-breakpoint
ALTER TABLE "payment_milestones" ADD CONSTRAINT "payment_milestones_invoice_number_unique" UNIQUE("invoice_number");