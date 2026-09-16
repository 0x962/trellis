CREATE TABLE "builder_start_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"run_id" text,
	"error" text,
	"retry_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "builder_start_requests_state_check" CHECK ("builder_start_requests"."state" IN ('pending','launching','assigned','canceled','failed'))
);
--> statement-breakpoint
ALTER TABLE "builder_start_requests" ADD CONSTRAINT "builder_start_requests_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_start_requests" ADD CONSTRAINT "builder_start_requests_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "builder_start_requests_pending_ticket_idx" ON "builder_start_requests" USING btree ("ticket_id") WHERE "builder_start_requests"."state"='pending';