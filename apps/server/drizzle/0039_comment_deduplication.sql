ALTER TABLE "comments" ADD COLUMN "dedupe_key" text;
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_dedupe_unique" UNIQUE ("ticket_id", "actor_kind", "actor_name", "dedupe_key");
