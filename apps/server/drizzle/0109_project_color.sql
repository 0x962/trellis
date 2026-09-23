ALTER TABLE "projects" ADD COLUMN "color" text;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_color_idx" ON "projects" USING btree ("color");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_color_check" CHECK ("projects"."color" IN ('orange', 'teal', 'blue', 'pink', 'azure'));