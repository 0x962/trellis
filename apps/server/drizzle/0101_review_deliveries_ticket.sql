ALTER TABLE "review_deliveries" DROP CONSTRAINT "review_deliveries_recipient";--> statement-breakpoint
ALTER TABLE "review_deliveries" DROP CONSTRAINT "review_deliveries_run_id_agent_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "review_deliveries" ALTER COLUMN "run_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD COLUMN "ticket_id" text;--> statement-breakpoint
-- Every row keeps its place. A row takes the ticket of the run it waited
-- for, and the upgrade removes no message.
UPDATE "review_deliveries" delivery SET "ticket_id" = run."ticket_id"
	FROM "agent_runs" run WHERE run."id" = delivery."run_id";--> statement-breakpoint
-- A row whose run holds no ticket names no recipient under the new rule.
-- It keeps its text and takes a final state, so the delivery loop passes
-- over it and a person reads why it stopped.
UPDATE "review_deliveries" SET "state" = 'failed',
	"error" = 'The agent run of this message held no ticket, so Trellis cannot name a new recipient.'
	WHERE "ticket_id" IS NULL AND "state" IN ('pending', 'sending');--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD CONSTRAINT "review_deliveries_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD CONSTRAINT "review_deliveries_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD CONSTRAINT "review_deliveries_recipient" UNIQUE NULLS NOT DISTINCT("review_id","thread_message_id","check_notice_id","ticket_id","run_id");