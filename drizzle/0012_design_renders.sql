CREATE TABLE "design_renders" (
	"id" text PRIMARY KEY NOT NULL,
	"design_id" text NOT NULL,
	"shot_id" text,
	"parent_id" text,
	"kind" text NOT NULL,
	"status" text DEFAULT 'working' NOT NULL,
	"prompt" text,
	"source_url" text,
	"url" text,
	"world_id" text,
	"poll" text,
	"error" text,
	"credits" integer,
	"chosen" boolean DEFAULT false NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "design_renders" ADD CONSTRAINT "design_renders_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_renders" ADD CONSTRAINT "design_renders_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;