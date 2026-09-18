-- Creates the label tables on a database that never ran 0067_project_labels.
-- Drizzle runs a migration only when its `when` in meta/_journal.json is above
-- the newest `created_at` in drizzle.__drizzle_migrations. The `when` of 0067
-- is below the `when` of 0068_remove_dispatch_paused, so a database that ran
-- 0068 first skips 0067 and every label query fails with
-- `relation "label_groups" does not exist`. A database that ran 0067 holds
-- both tables, so every statement here is idempotent and ends in the same
-- state.
CREATE TABLE IF NOT EXISTS "label_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "label_groups_name_check" CHECK ("label_groups"."name" = btrim("label_groups"."name") AND length("label_groups"."name") BETWEEN 1 AND 80),
	CONSTRAINT "label_groups_position_check" CHECK ("label_groups"."position" >= 0),
	CONSTRAINT "label_groups_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "labels" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'fg-muted' NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "labels_name_check" CHECK ("labels"."name" = btrim("labels"."name") AND length("labels"."name") BETWEEN 1 AND 80),
	CONSTRAINT "labels_color_check" CHECK ("labels"."color" IN ('fg', 'fg-muted', 'fg-faint', 'accent', 'agent', 'success', 'warning', 'danger')),
	CONSTRAINT "labels_position_check" CHECK ("labels"."position" >= 0),
	CONSTRAINT "labels_group_id_label_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."label_groups"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "label_groups_project_id_name_unique" ON "label_groups" USING btree ("project_id",lower("name"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "label_groups_project_id_position_idx" ON "label_groups" USING btree ("project_id","position","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "labels_group_id_name_unique" ON "labels" USING btree ("group_id",lower("name"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "labels_group_id_position_idx" ON "labels" USING btree ("group_id","position","id");
