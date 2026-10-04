CREATE TABLE "daily_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_reports_day_unique" UNIQUE("day")
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"country" text DEFAULT 'China' NOT NULL,
	"city" text,
	"category" text,
	"contact_name" text,
	"phone" text,
	"email" text,
	"currency" text DEFAULT 'CNY' NOT NULL,
	"lead_time_days" integer,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "vendor_id" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "po_number" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "boq_item_id" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "qty" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "unit" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "unit_cost" numeric(16, 2);--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "fx_rate" numeric(14, 6);--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "ordered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "shipped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "container_no" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "port" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "site_lat" double precision;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "site_lng" double precision;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_boq_item_id_boq_items_id_fk" FOREIGN KEY ("boq_item_id") REFERENCES "public"."boq_items"("id") ON DELETE set null ON UPDATE no action;