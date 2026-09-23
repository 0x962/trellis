-- Gives a project a color. Every statement is idempotent, because a database
-- that ran an earlier build of this work already holds the column, the index
-- and the constraint under another tag. Drizzle runs a migration only when
-- its `when` in meta/_journal.json is above the newest `created_at` in
-- drizzle.__drizzle_migrations, and the rename of the tag put this file above
-- the recorded value of that build. A fresh database ends in the same state.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "color" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "projects_color_idx" ON "projects" USING btree ("color");--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_color_check";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_color_check" CHECK ("projects"."color" IN ('orange', 'teal', 'blue', 'pink', 'azure'));