ALTER TABLE "session_updates" DROP CONSTRAINT "session_updates_request_fk";--> statement-breakpoint
ALTER TABLE "session_update_requests" DROP CONSTRAINT "session_update_requests_session_request_unique";--> statement-breakpoint
ALTER TABLE "session_updates" DROP CONSTRAINT "session_updates_session_request_unique";--> statement-breakpoint
ALTER TABLE "session_update_requests" DROP CONSTRAINT "session_update_requests_session_id_sessions_id_fk";
--> statement-breakpoint
ALTER TABLE "session_updates" DROP CONSTRAINT "session_updates_session_id_sessions_id_fk";
--> statement-breakpoint
DROP INDEX "session_update_requests_outstanding_idx";--> statement-breakpoint
DROP INDEX "session_update_requests_latest_idx";--> statement-breakpoint
DROP INDEX "session_updates_latest_idx";--> statement-breakpoint
ALTER TABLE "session_update_requests" ALTER COLUMN "session_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "session_updates" ALTER COLUMN "session_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "session_update_requests" ADD COLUMN "run_id" text;--> statement-breakpoint
UPDATE "session_update_requests" SET "run_id"="sessions"."run_id"
FROM "sessions" WHERE "session_update_requests"."session_id"="sessions"."id";--> statement-breakpoint
ALTER TABLE "session_update_requests" ALTER COLUMN "run_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "session_update_requests" ADD CONSTRAINT "session_update_requests_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_update_requests" ADD CONSTRAINT "session_update_requests_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_updates" ADD CONSTRAINT "session_updates_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_update_requests" ADD CONSTRAINT "session_update_requests_run_request_unique" UNIQUE("run_id","request_id");--> statement-breakpoint
ALTER TABLE "session_updates" ADD CONSTRAINT "session_updates_request_fk" FOREIGN KEY ("run_id","request_id") REFERENCES "public"."session_update_requests"("run_id","request_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_update_requests_outstanding_idx" ON "session_update_requests" USING btree ("run_id") WHERE "session_update_requests"."state" IN ('pending', 'sent');--> statement-breakpoint
CREATE INDEX "session_update_requests_latest_idx" ON "session_update_requests" USING btree ("run_id","requested_at" DESC NULLS LAST,"request_id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "session_updates_latest_idx" ON "session_updates" USING btree ("run_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "session_updates" ADD CONSTRAINT "session_updates_run_request_unique" UNIQUE("run_id","request_id");
