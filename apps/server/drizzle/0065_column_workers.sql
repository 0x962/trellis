CREATE TABLE "column_workers" (
	"ticket_id" text PRIMARY KEY NOT NULL,
	"status_id" text,
	"run_id" text NOT NULL,
	"retired" boolean DEFAULT false NOT NULL,
	"heartbeat_at" timestamp (3) with time zone
);
--> statement-breakpoint
ALTER TABLE "statuses" ADD COLUMN "agent_config" jsonb;--> statement-breakpoint
ALTER TABLE "column_workers" ADD CONSTRAINT "column_workers_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "column_workers" ADD CONSTRAINT "column_workers_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "column_workers" ADD CONSTRAINT "column_workers_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
WITH RECURSIVE ancestors AS (
 SELECT s.id AS status_id,p.id,p.parent_id,p.manager_config,0 AS depth
 FROM statuses s JOIN projects p ON p.id=s.project_id WHERE s.category='started'
 UNION ALL SELECT a.status_id,p.id,p.parent_id,p.manager_config,a.depth+1
 FROM projects p JOIN ancestors a ON p.id=a.parent_id
), defaults AS (
 SELECT DISTINCT ON (status_id) status_id,manager_config->'builder' AS config FROM ancestors
 WHERE manager_config->'builder'->>'personaId' IS NOT NULL ORDER BY status_id,depth
)
UPDATE statuses s SET agent_config=d.config || '{"accountId":null}'::jsonb FROM defaults d WHERE s.id=d.status_id;
--> statement-breakpoint
UPDATE builder_start_requests SET state='canceled' WHERE state IN ('pending','launching');
