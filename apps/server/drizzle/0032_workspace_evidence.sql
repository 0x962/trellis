CREATE TABLE "evidence_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"attempt_id" text NOT NULL,
	"path" text NOT NULL,
	"document" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"attempt_id" text NOT NULL,
	"document" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"finished_at" timestamp (3) with time zone
);
--> statement-breakpoint
ALTER TABLE "evidence_artifacts" ADD CONSTRAINT "evidence_artifacts_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_checks" ADD CONSTRAINT "evidence_checks_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_artifacts_run_created_idx" ON "evidence_artifacts" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "evidence_checks_run_created_idx" ON "evidence_checks" USING btree ("run_id","created_at");