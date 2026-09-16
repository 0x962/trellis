CREATE TABLE "needs_you_states" (
	"actor_name" text NOT NULL,
	"item_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"snoozed_until" timestamp (3) with time zone,
	"ignored" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "needs_you_states_actor_name_item_id_pk" PRIMARY KEY("actor_name","item_id"),
	CONSTRAINT "needs_you_states_action_check" CHECK (NOT ("needs_you_states"."ignored" AND "needs_you_states"."snoozed_until" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "needs_you_states" ADD CONSTRAINT "needs_you_states_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;