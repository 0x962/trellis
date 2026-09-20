ALTER TABLE "pull_requests" ADD COLUMN "additions" integer;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "deletions" integer;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "changed_files" integer;