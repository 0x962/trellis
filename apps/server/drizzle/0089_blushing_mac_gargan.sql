CREATE TABLE "epic_resources" (
	"id" text PRIMARY KEY NOT NULL,
	"epic_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"body" text,
	"url" text,
	"blob_sha256" text,
	"blob_size" bigint,
	"mime" text,
	"ticket_id" text,
	"actor_name" text NOT NULL,
	"actor_kind" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "epic_resources_kind_check" CHECK ("epic_resources"."kind" IN ('doc', 'link', 'image', 'file')),
	CONSTRAINT "epic_resources_name_check" CHECK ("epic_resources"."name" = btrim("epic_resources"."name") AND length("epic_resources"."name") BETWEEN 1 AND 255),
	CONSTRAINT "epic_resources_body_check" CHECK ("epic_resources"."body" IS NULL OR length("epic_resources"."body") <= 200000),
	CONSTRAINT "epic_resources_url_check" CHECK ("epic_resources"."url" IS NULL OR length("epic_resources"."url") BETWEEN 1 AND 10000),
	CONSTRAINT "epic_resources_blob_sha256_check" CHECK ("epic_resources"."blob_sha256" IS NULL OR "epic_resources"."blob_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "epic_resources_blob_size_check" CHECK ("epic_resources"."blob_size" IS NULL OR "epic_resources"."blob_size" > 0),
	CONSTRAINT "epic_resources_value_check" CHECK (("epic_resources"."kind" = 'doc' AND "epic_resources"."body" IS NOT NULL AND "epic_resources"."url" IS NULL AND "epic_resources"."blob_sha256" IS NULL AND "epic_resources"."blob_size" IS NULL AND "epic_resources"."mime" IS NULL)
				OR ("epic_resources"."kind" = 'link' AND "epic_resources"."body" IS NULL AND "epic_resources"."url" IS NOT NULL AND "epic_resources"."blob_sha256" IS NULL AND "epic_resources"."blob_size" IS NULL AND "epic_resources"."mime" IS NULL)
				OR ("epic_resources"."kind" IN ('image', 'file') AND "epic_resources"."body" IS NULL AND "epic_resources"."url" IS NULL AND "epic_resources"."blob_sha256" IS NOT NULL AND "epic_resources"."blob_size" IS NOT NULL AND "epic_resources"."mime" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "epic_resources" ADD CONSTRAINT "epic_resources_epic_id_epics_id_fk" FOREIGN KEY ("epic_id") REFERENCES "public"."epics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epic_resources" ADD CONSTRAINT "epic_resources_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epic_resources" ADD CONSTRAINT "epic_resources_actor_fk" FOREIGN KEY ("actor_name","actor_kind") REFERENCES "public"."actors"("name","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "epic_resources_epic_id_created_at_idx" ON "epic_resources" USING btree ("epic_id","created_at");--> statement-breakpoint
CREATE INDEX "epic_resources_blob_sha256_idx" ON "epic_resources" USING btree ("blob_sha256") WHERE "epic_resources"."blob_sha256" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "epic_resources_ticket_id_idx" ON "epic_resources" USING btree ("ticket_id");
