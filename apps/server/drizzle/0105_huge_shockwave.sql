ALTER TABLE "flows" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "flows" ADD CONSTRAINT "flows_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flows_project_id_idx" ON "flows" USING btree ("project_id");