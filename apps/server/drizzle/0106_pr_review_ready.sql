ALTER TABLE "pull_requests" DROP CONSTRAINT "pull_requests_local_state_check";--> statement-breakpoint
UPDATE "pull_requests" SET "local_state" = 'not-ready' WHERE "local_state" = 'draft';--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "ready_for_review_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_local_state_check" CHECK ("pull_requests"."local_state" IN ('not-ready', 'ready'));
