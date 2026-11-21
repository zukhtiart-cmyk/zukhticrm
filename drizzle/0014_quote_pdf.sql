ALTER TABLE "boq_items" ADD COLUMN "show_price" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "offices" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "offices" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "offices" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "offices" ADD COLUMN "tax_id" text;