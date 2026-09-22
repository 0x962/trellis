ALTER TABLE "review_deliveries" DROP CONSTRAINT "review_deliveries_recipient";--> statement-breakpoint
ALTER TABLE "review_deliveries" DROP CONSTRAINT "review_deliveries_run_id_agent_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "review_deliveries" ALTER COLUMN "run_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD COLUMN "ticket_id" text;--> statement-breakpoint
UPDATE "review_deliveries" delivery SET "ticket_id" = run."ticket_id"
	FROM "agent_runs" run WHERE run."id" = delivery."run_id";--> statement-breakpoint
DELETE FROM "review_deliveries" WHERE "ticket_id" IS NULL;--> statement-breakpoint
DELETE FROM "review_deliveries" delivery WHERE EXISTS (
	SELECT 1 FROM "review_deliveries" other
	WHERE other."ticket_id" = delivery."ticket_id"
		AND other."review_id" IS NOT DISTINCT FROM delivery."review_id"
		AND other."thread_message_id" IS NOT DISTINCT FROM delivery."thread_message_id"
		AND other."check_notice_id" IS NOT DISTINCT FROM delivery."check_notice_id"
		AND other."id" > delivery."id");--> statement-breakpoint
ALTER TABLE "review_deliveries" ALTER COLUMN "ticket_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD CONSTRAINT "review_deliveries_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD CONSTRAINT "review_deliveries_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD CONSTRAINT "review_deliveries_recipient" UNIQUE NULLS NOT DISTINCT("review_id","thread_message_id","check_notice_id","ticket_id");
