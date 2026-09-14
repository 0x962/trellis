CREATE TABLE "agent_execution_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"generation" integer NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "agent_execution_attempts_run_generation_unique" UNIQUE("run_id","generation")
);
--> statement-breakpoint
CREATE TABLE "agent_start_requests" (
	"request_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"actor_kind" text NOT NULL,
	"run_id" text NOT NULL,
	"target" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "agent_start_requests_actor_kind_actor_name_request_id_pk" PRIMARY KEY("actor_kind","actor_name","request_id")
);
--> statement-breakpoint
ALTER TABLE "agent_execution_attempts" ADD CONSTRAINT "agent_execution_attempts_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_start_requests" ADD CONSTRAINT "agent_start_requests_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;