CREATE TABLE "resource_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"resource_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"body" text NOT NULL,
	"quote" text,
	"prefix" text,
	"suffix" text,
	"text_removed" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp (3) with time zone,
	"resolved_by_name" text,
	"resolved_by_kind" text,
	"actor_name" text NOT NULL,
	"actor_kind" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "resource_comments_body_check" CHECK (length("resource_comments"."body") BETWEEN 1 AND 10000),
	CONSTRAINT "resource_comments_thread_check" CHECK (("resource_comments"."id" = "resource_comments"."thread_id" AND "resource_comments"."quote" IS NOT NULL AND "resource_comments"."prefix" IS NOT NULL AND "resource_comments"."suffix" IS NOT NULL)
				OR ("resource_comments"."id" <> "resource_comments"."thread_id" AND "resource_comments"."quote" IS NULL AND "resource_comments"."prefix" IS NULL AND "resource_comments"."suffix" IS NULL
					AND NOT "resource_comments"."text_removed" AND "resource_comments"."resolved_at" IS NULL)),
	CONSTRAINT "resource_comments_anchor_check" CHECK ("resource_comments"."quote" IS NULL OR (length("resource_comments"."quote") BETWEEN 1 AND 2000 AND length("resource_comments"."prefix") <= 32 AND length("resource_comments"."suffix") <= 32)),
	CONSTRAINT "resource_comments_resolved_check" CHECK (("resource_comments"."resolved_at" IS NULL) = ("resource_comments"."resolved_by_name" IS NULL) AND ("resource_comments"."resolved_at" IS NULL) = ("resource_comments"."resolved_by_kind" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "resource_comments" ADD CONSTRAINT "resource_comments_resource_id_epic_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."epic_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_comments" ADD CONSTRAINT "resource_comments_thread_id_resource_comments_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."resource_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_comments" ADD CONSTRAINT "resource_comments_actor_fk" FOREIGN KEY ("actor_name","actor_kind") REFERENCES "public"."actors"("name","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_comments" ADD CONSTRAINT "resource_comments_resolved_by_fk" FOREIGN KEY ("resolved_by_name","resolved_by_kind") REFERENCES "public"."actors"("name","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resource_comments_resource_id_idx" ON "resource_comments" USING btree ("resource_id","created_at");--> statement-breakpoint
CREATE INDEX "resource_comments_thread_id_idx" ON "resource_comments" USING btree ("thread_id");