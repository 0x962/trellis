-- Replaces the tables "label_groups" and "labels" and adds "ticket_labels",
-- the table that puts a label on a ticket.
-- The first two statements drop the tables that 0067_project_labels created,
-- with every row in them. Those rows are project settings, and no ticket
-- points at a label before this migration, so no ticket loses data. The rows
-- cannot move to the new tables safely: "project_id" now holds the root
-- project of the tree, two projects of one tree can hold the same group name,
-- and the unique index on the name would then fail this migration and stop
-- the server at boot.
-- IF EXISTS makes the two statements run clean on a database that has the old
-- tables and on a database that does not.
DROP TABLE IF EXISTS "labels";--> statement-breakpoint
DROP TABLE IF EXISTS "label_groups";--> statement-breakpoint
CREATE TABLE "label_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "label_groups_name_check" CHECK ("label_groups"."name" = btrim("label_groups"."name") AND length("label_groups"."name") BETWEEN 1 AND 80 AND position(',' IN "label_groups"."name") = 0 AND position('/' IN "label_groups"."name") = 0 AND lower("label_groups"."name") <> 'none')
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"group_id" text,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "labels_name_check" CHECK ("labels"."name" = btrim("labels"."name") AND length("labels"."name") BETWEEN 1 AND 80 AND position(',' IN "labels"."name") = 0 AND position('/' IN "labels"."name") = 0 AND lower("labels"."name") <> 'none'),
	CONSTRAINT "labels_color_check" CHECK ("labels"."color" IN ('gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink')),
	CONSTRAINT "labels_description_check" CHECK (char_length("labels"."description") <= 255)
);
--> statement-breakpoint
CREATE TABLE "ticket_labels" (
	"ticket_id" text NOT NULL,
	"label_id" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "ticket_labels_pkey" PRIMARY KEY("ticket_id","label_id")
);
--> statement-breakpoint
ALTER TABLE "label_groups" ADD CONSTRAINT "label_groups_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_group_id_label_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."label_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_labels" ADD CONSTRAINT "ticket_labels_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_labels" ADD CONSTRAINT "ticket_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "label_groups_project_id_name_unique" ON "label_groups" USING btree ("project_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "labels_group_id_name_unique" ON "labels" USING btree ("group_id",lower("name")) WHERE "labels"."group_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "labels_project_id_name_unique" ON "labels" USING btree ("project_id",lower("name")) WHERE "labels"."group_id" IS NULL;--> statement-breakpoint
CREATE INDEX "labels_project_id_idx" ON "labels" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ticket_labels_label_id_idx" ON "ticket_labels" USING btree ("label_id");