CREATE TABLE "epic_chatter_settings" (
	"epic_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatter_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"delivery_key" text NOT NULL,
	"message_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"sender_name" text NOT NULL,
	"recipient_id" text NOT NULL,
	"recipient_name" text NOT NULL,
	"sender_epic_id" text,
	"recipient_epic_id" text,
	"text" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "chatter_messages_state_check" CHECK ("chatter_messages"."state" IN ('pending', 'sent', 'queued', 'skipped', 'unconfirmed'))
);
--> statement-breakpoint
ALTER TABLE "epic_chatter_settings" ADD CONSTRAINT "epic_chatter_settings_epic_id_epics_id_fk" FOREIGN KEY ("epic_id") REFERENCES "public"."epics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatter_messages" ADD CONSTRAINT "chatter_messages_sender_epic_id_epics_id_fk" FOREIGN KEY ("sender_epic_id") REFERENCES "public"."epics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatter_messages" ADD CONSTRAINT "chatter_messages_recipient_epic_id_epics_id_fk" FOREIGN KEY ("recipient_epic_id") REFERENCES "public"."epics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chatter_messages_delivery_idx" ON "chatter_messages" USING btree ("delivery_key");--> statement-breakpoint
CREATE INDEX "chatter_messages_sender_epic_idx" ON "chatter_messages" USING btree ("sender_epic_id","id");--> statement-breakpoint
CREATE INDEX "chatter_messages_recipient_epic_idx" ON "chatter_messages" USING btree ("recipient_epic_id","id");