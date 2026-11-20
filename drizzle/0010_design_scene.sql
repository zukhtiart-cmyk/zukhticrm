ALTER TABLE "designs" ADD COLUMN "scene" jsonb;--> statement-breakpoint
ALTER TABLE "designs" DROP COLUMN "world_id";--> statement-breakpoint
ALTER TABLE "designs" DROP COLUMN "world_status";--> statement-breakpoint
ALTER TABLE "designs" DROP COLUMN "world_operation";