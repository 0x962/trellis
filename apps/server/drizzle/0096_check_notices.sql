CREATE TABLE "check_notices" (
	"id" text PRIMARY KEY NOT NULL,
	"pr_id" text NOT NULL,
	"head_sha" text NOT NULL,
	"kind" text NOT NULL,
	"checks" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "check_notices_kind_check" CHECK ("check_notices"."kind" IN ('failed', 'passed', 'stuck')),
	CONSTRAINT "check_notices_checks_check" CHECK (jsonb_typeof("check_notices"."checks") = 'array')
);
--> statement-breakpoint
ALTER TABLE "review_deliveries" DROP CONSTRAINT "review_deliveries_recipient";--> statement-breakpoint
ALTER TABLE "review_deliveries" DROP CONSTRAINT "review_deliveries_one_source";--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "checks_changed_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD COLUMN "check_notice_id" text;--> statement-breakpoint
ALTER TABLE "check_notices" ADD CONSTRAINT "check_notices_pr_id_pull_requests_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "check_notices_pr_created" ON "check_notices" USING btree ("pr_id","created_at");--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD CONSTRAINT "review_deliveries_check_notice_id_check_notices_id_fk" FOREIGN KEY ("check_notice_id") REFERENCES "public"."check_notices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD CONSTRAINT "review_deliveries_recipient" UNIQUE NULLS NOT DISTINCT("review_id","thread_message_id","check_notice_id","run_id");--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD CONSTRAINT "review_deliveries_one_source" CHECK (num_nonnulls("review_deliveries"."review_id", "review_deliveries"."thread_message_id", "review_deliveries"."check_notice_id") = 1);