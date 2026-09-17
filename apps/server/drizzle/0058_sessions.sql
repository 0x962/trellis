CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"directory" text NOT NULL,
	"harness" jsonb NOT NULL,
	"run_id" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "sessions_name_unique" UNIQUE("name"),
	CONSTRAINT "sessions_run_id_unique" UNIQUE("run_id"),
	CONSTRAINT "sessions_name_check" CHECK ("sessions"."name" ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$')
);
--> statement-breakpoint
ALTER TABLE "agent_runs" DROP CONSTRAINT "agent_runs_kind_check";--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_kind_check" CHECK ("agent_runs"."kind" IN ('builder', 'reviewer', 'manager', 'session'));
