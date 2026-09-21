-- A delivery row that points at an answer holds no other message, so the
-- new one-source check would refuse it.
DELETE FROM "review_deliveries" WHERE "answer_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "review_deliveries" DROP CONSTRAINT "review_deliveries_recipient";--> statement-breakpoint
ALTER TABLE "review_deliveries" DROP CONSTRAINT "review_deliveries_one_source";--> statement-breakpoint
ALTER TABLE "review_deliveries" DROP CONSTRAINT "review_deliveries_answer_id_ticket_answers_id_fk";--> statement-breakpoint
ALTER TABLE "review_deliveries" DROP COLUMN "answer_id";--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD CONSTRAINT "review_deliveries_recipient" UNIQUE NULLS NOT DISTINCT("review_id","thread_message_id","run_id");--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD CONSTRAINT "review_deliveries_one_source" CHECK (num_nonnulls("review_deliveries"."review_id", "review_deliveries"."thread_message_id") = 1);--> statement-breakpoint
DROP TABLE "ticket_answers";
