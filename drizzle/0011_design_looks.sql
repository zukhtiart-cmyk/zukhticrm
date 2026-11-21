CREATE TABLE "design_themes" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"theme" jsonb NOT NULL,
	"refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "designs" ADD COLUMN "look" jsonb;--> statement-breakpoint
ALTER TABLE "design_themes" ADD CONSTRAINT "design_themes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;