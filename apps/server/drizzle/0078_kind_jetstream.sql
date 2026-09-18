CREATE TABLE "epics" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"root_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"actor_name" text NOT NULL,
	"actor_kind" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "epics_id_root_id_unique" UNIQUE("id","root_id"),
	CONSTRAINT "epics_root_id_slug_unique" UNIQUE("root_id","slug"),
	CONSTRAINT "epics_slug_check" CHECK ("epics"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "epics_name_check" CHECK ("epics"."name" = btrim("epics"."name") AND length("epics"."name") BETWEEN 1 AND 120),
	CONSTRAINT "epics_description_check" CHECK (length("epics"."description") <= 200000)
);
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "epic_id" text;--> statement-breakpoint
ALTER TABLE "epics" ADD CONSTRAINT "epics_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epics" ADD CONSTRAINT "epics_actor_fk" FOREIGN KEY ("actor_name","actor_kind") REFERENCES "public"."actors"("name","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epics" ADD CONSTRAINT "epics_project_fk" FOREIGN KEY ("project_id","root_id") REFERENCES "public"."projects"("id","root_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "epics_project_id_idx" ON "epics" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_epic_fk" FOREIGN KEY ("epic_id") REFERENCES "public"."epics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tickets_epic_id_idx" ON "tickets" USING btree ("epic_id");