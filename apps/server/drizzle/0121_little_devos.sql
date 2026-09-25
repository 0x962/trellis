ALTER TABLE "check_notices" DROP CONSTRAINT "check_notices_kind_check";--> statement-breakpoint
ALTER TABLE "check_notices" ADD COLUMN "is_queued" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "check_notices" ADD COLUMN "queue_position" integer;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "queue_position" integer;--> statement-breakpoint
ALTER TABLE "check_notices" ADD CONSTRAINT "check_notices_kind_check" CHECK ("check_notices"."kind" IN ('failed', 'passed', 'stuck', 'conflict', 'clear', 'queued', 'dequeued', 'merged'));