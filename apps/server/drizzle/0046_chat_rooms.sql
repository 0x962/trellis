CREATE TABLE "chat_channels" (
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"actor_name" text NOT NULL,
	"actor_kind" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "chat_channels_pkey" PRIMARY KEY("project_id","name"),
	CONSTRAINT "chat_channels_name_check" CHECK ("chat_channels"."name" ~ '^[a-z0-9][a-z0-9_-]{0,31}$')
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"channel" text NOT NULL,
	"body" text NOT NULL,
	"actor_name" text NOT NULL,
	"actor_kind" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "chat_messages_body_check" CHECK (length("chat_messages"."body") BETWEEN 1 AND 20000)
);
--> statement-breakpoint
CREATE TABLE "chat_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"run_id" text NOT NULL,
	"persona_name" text NOT NULL,
	"terminal_id" text,
	"session_id" text,
	"state" text DEFAULT 'pending' NOT NULL,
	"error" text,
	CONSTRAINT "chat_deliveries_recipient" UNIQUE("message_id","run_id")
);
--> statement-breakpoint
ALTER TABLE "chat_channels" ADD CONSTRAINT "chat_channels_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_channels" ADD CONSTRAINT "chat_channels_actor_fk" FOREIGN KEY ("actor_name","actor_kind") REFERENCES "public"."actors"("name","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_channel_fk" FOREIGN KEY ("project_id","channel") REFERENCES "public"."chat_channels"("project_id","name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_actor_fk" FOREIGN KEY ("actor_name","actor_kind") REFERENCES "public"."actors"("name","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_deliveries" ADD CONSTRAINT "chat_deliveries_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_deliveries" ADD CONSTRAINT "chat_deliveries_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_channel_id_idx" ON "chat_messages" USING btree ("project_id","channel","id");--> statement-breakpoint
CREATE INDEX "chat_deliveries_state_idx" ON "chat_deliveries" USING btree ("state");--> statement-breakpoint
CREATE INDEX "chat_deliveries_run_id_idx" ON "chat_deliveries" USING btree ("run_id");--> statement-breakpoint
INSERT INTO "actors" ("name", "kind", "first_seen_at", "last_seen_at") VALUES ('trellis', 'system', now(), now()) ON CONFLICT ("name", "kind") DO NOTHING;--> statement-breakpoint
INSERT INTO "chat_channels" ("project_id", "name", "actor_name", "actor_kind", "created_at")
SELECT p.id, c.name, 'trellis', 'system', now() FROM "projects" p CROSS JOIN (VALUES ('ai'), ('general')) AS c(name) WHERE p.parent_id IS NULL;
