-- An archived project holds no color slot, as it holds no name. The index
-- below counts the active projects alone.
DROP INDEX IF EXISTS "projects_color_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "projects_color_idx" ON "projects" USING btree ("color") WHERE "projects"."archived_at" IS NULL;