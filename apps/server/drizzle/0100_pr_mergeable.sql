ALTER TABLE "check_notices" DROP CONSTRAINT "check_notices_kind_check";--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "mergeable" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "check_notices" ADD CONSTRAINT "check_notices_kind_check" CHECK ("check_notices"."kind" IN ('failed', 'passed', 'stuck', 'conflict', 'clear'));--> statement-breakpoint
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_mergeable_check" CHECK ("pull_requests"."mergeable" IN ('mergeable', 'conflicting', 'unknown'));