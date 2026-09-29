CREATE TABLE "session_update_requests" (
	"request_id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"requested_at" timestamp (3) with time zone NOT NULL,
	"state" text NOT NULL,
	"error" text,
	CONSTRAINT "session_update_requests_session_request_unique" UNIQUE("session_id","request_id"),
	CONSTRAINT "session_update_requests_state_check" CHECK ("session_update_requests"."state" IN ('pending', 'sent', 'answered', 'failed')),
	CONSTRAINT "session_update_requests_error_check" CHECK (("session_update_requests"."state" = 'failed') = ("session_update_requests"."error" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "session_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"run_id" text NOT NULL,
	"request_id" text,
	"body" text NOT NULL,
	"embeds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "session_updates_session_request_unique" UNIQUE("session_id","request_id"),
	CONSTRAINT "session_updates_body_check" CHECK (length(btrim("session_updates"."body")) > 0),
	CONSTRAINT "session_updates_embeds_check" CHECK (jsonb_typeof("session_updates"."embeds") = 'array')
);
--> statement-breakpoint
ALTER TABLE "session_update_requests" ADD CONSTRAINT "session_update_requests_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_updates" ADD CONSTRAINT "session_updates_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_updates" ADD CONSTRAINT "session_updates_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_updates" ADD CONSTRAINT "session_updates_request_fk" FOREIGN KEY ("session_id","request_id") REFERENCES "public"."session_update_requests"("session_id","request_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_update_requests_outstanding_idx" ON "session_update_requests" USING btree ("session_id") WHERE "session_update_requests"."state" IN ('pending', 'sent');--> statement-breakpoint
CREATE INDEX "session_update_requests_latest_idx" ON "session_update_requests" USING btree ("session_id","requested_at" DESC NULLS LAST,"request_id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "session_updates_latest_idx" ON "session_updates" USING btree ("session_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);