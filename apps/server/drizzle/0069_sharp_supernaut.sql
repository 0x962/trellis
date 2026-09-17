DELETE FROM "activity"
WHERE "action" = 'pr.linked'
	AND "actor_name" = 'trellis'
	AND "actor_kind" = 'system';--> statement-breakpoint
DELETE FROM "ticket_pull_requests" WHERE "source" = 'auto';--> statement-breakpoint
DELETE FROM "pull_requests"
WHERE NOT "review_retained"
	AND NOT EXISTS (
		SELECT 1 FROM "ticket_pull_requests"
		WHERE "ticket_pull_requests"."pull_request_id" = "pull_requests"."id"
	);--> statement-breakpoint
ALTER TABLE "ticket_pull_requests" DROP CONSTRAINT "ticket_pull_requests_source_check";--> statement-breakpoint
ALTER TABLE "ticket_pull_requests" ADD CONSTRAINT "ticket_pull_requests_source_check" CHECK ("ticket_pull_requests"."source" IN ('manual'));
