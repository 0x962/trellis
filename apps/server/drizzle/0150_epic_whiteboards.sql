CREATE TABLE "epic_whiteboards" (
	"epic_id" text PRIMARY KEY NOT NULL,
	"snapshot" jsonb NOT NULL,
	"revision" integer NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "epic_whiteboards_snapshot_object" CHECK (jsonb_typeof("epic_whiteboards"."snapshot") = 'object'),
	CONSTRAINT "epic_whiteboards_revision_positive" CHECK ("epic_whiteboards"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "epic_whiteboards" ADD CONSTRAINT "epic_whiteboards_epic_id_epics_id_fk" FOREIGN KEY ("epic_id") REFERENCES "public"."epics"("id") ON DELETE cascade ON UPDATE no action;