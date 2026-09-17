CREATE TABLE "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"audience" text DEFAULT 'all' NOT NULL,
	"expires_at" timestamp (3) with time zone,
	"actor_name" text NOT NULL,
	"actor_kind" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "notes_title_check" CHECK ("notes"."title" = btrim("notes"."title") AND length("notes"."title") BETWEEN 1 AND 120),
	CONSTRAINT "notes_body_check" CHECK (length("notes"."body") BETWEEN 1 AND 4000),
	CONSTRAINT "notes_audience_check" CHECK ("notes"."audience" IN ('all', 'manager', 'worker'))
);
--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_actor_fk" FOREIGN KEY ("actor_name","actor_kind") REFERENCES "public"."actors"("name","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notes_project_id_title_idx" ON "notes" USING btree ("project_id",lower("title"));--> statement-breakpoint
CREATE INDEX "notes_project_id_updated_at_idx" ON "notes" USING btree ("project_id","updated_at" DESC NULLS FIRST);