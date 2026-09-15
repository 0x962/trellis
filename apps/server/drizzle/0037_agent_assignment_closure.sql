ALTER TABLE agent_runs ADD COLUMN closed_at timestamp (3) with time zone;
--> statement-breakpoint
UPDATE agent_runs SET closed_at = updated_at WHERE state IN ('stopped', 'exited', 'failed');
--> statement-breakpoint
DROP INDEX agent_runs_active_ticket_idx;
--> statement-breakpoint
DROP INDEX agent_runs_active_manager_idx;
--> statement-breakpoint
ALTER TABLE agent_runs DROP CONSTRAINT agent_runs_state_check;
--> statement-breakpoint
ALTER TABLE agent_runs DROP COLUMN state;
--> statement-breakpoint
CREATE INDEX agent_runs_active_ticket_idx ON agent_runs (ticket_id) WHERE runtime = 'native' AND closed_at IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX agent_runs_active_manager_idx ON agent_runs (project_id) WHERE kind = 'manager' AND runtime = 'native' AND closed_at IS NULL;
--> statement-breakpoint
DROP TABLE agent_harness_observations;
--> statement-breakpoint
DROP TABLE agent_harness_receipts;
