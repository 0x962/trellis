ALTER TABLE "chat_channels" ADD COLUMN "ai_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "chat_channels" SET "ai_only" = true WHERE "name" = 'ai';--> statement-breakpoint
CREATE TABLE "chat_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"actor_name" text NOT NULL,
	"actor_kind" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "chat_attachments_filename_check" CHECK (length("chat_attachments"."filename") BETWEEN 1 AND 255 AND position('/' IN "chat_attachments"."filename") = 0),
	CONSTRAINT "chat_attachments_size_check" CHECK ("chat_attachments"."size" > 0),
	CONSTRAINT "chat_attachments_sha256_check" CHECK ("chat_attachments"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_actor_fk" FOREIGN KEY ("actor_name","actor_kind") REFERENCES "public"."actors"("name","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_attachments_project_id_idx" ON "chat_attachments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "chat_attachments_sha256_idx" ON "chat_attachments" USING btree ("sha256");
