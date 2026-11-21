ALTER TABLE "boq_items" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "boq_items" ADD COLUMN "size" text;--> statement-breakpoint
ALTER TABLE "boq_items" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "quote_setup" jsonb;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "mode" text DEFAULT 'itemised' NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "meta" jsonb;--> statement-breakpoint
ALTER TABLE "rate_items" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "rate_items" ADD COLUMN "spec" text;--> statement-breakpoint
ALTER TABLE "rate_items" ADD COLUMN "room_types" jsonb;--> statement-breakpoint
ALTER TABLE "rate_items" ADD COLUMN "qty_rule" text;--> statement-breakpoint
ALTER TABLE "rate_items" ADD COLUMN "preselect" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rate_items" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;