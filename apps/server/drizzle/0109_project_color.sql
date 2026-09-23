-- Gives a project a color. Some databases already hold the column, the index
-- and the constraint, so every statement is idempotent and a fresh database
-- ends in the same state.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "color" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "projects_color_idx" ON "projects" USING btree ("color");--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_color_check";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_color_check" CHECK ("projects"."color" IN ('orange', 'teal', 'blue', 'pink', 'azure'));