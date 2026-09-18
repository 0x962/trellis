CREATE TABLE "milestones" (
	"id" text PRIMARY KEY NOT NULL,
	"epic_id" text NOT NULL,
	"root_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "milestones_id_epic_id_unique" UNIQUE("id","epic_id"),
	CONSTRAINT "milestones_epic_id_slug_unique" UNIQUE("epic_id","slug"),
	CONSTRAINT "milestones_slug_check" CHECK ("milestones"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "milestones_name_check" CHECK ("milestones"."name" = btrim("milestones"."name") AND length("milestones"."name") BETWEEN 1 AND 120),
	CONSTRAINT "milestones_position_check" CHECK ("milestones"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "milestone_id" text;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_epic_id_epics_id_fk" FOREIGN KEY ("epic_id") REFERENCES "public"."epics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_epic_fk" FOREIGN KEY ("epic_id","root_id") REFERENCES "public"."epics"("id","root_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "milestones_epic_id_position_idx" ON "milestones" USING btree ("epic_id","position");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_milestone_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tickets_milestone_id_idx" ON "tickets" USING btree ("milestone_id");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_milestone_needs_epic" CHECK ("tickets"."milestone_id" IS NULL OR "tickets"."epic_id" IS NOT NULL);