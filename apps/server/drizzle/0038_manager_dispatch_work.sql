ALTER TABLE manager_dispatches ADD COLUMN work_state text NOT NULL DEFAULT 'untracked';
--> statement-breakpoint
ALTER TABLE manager_dispatches ALTER COLUMN work_state SET DEFAULT 'open';
--> statement-breakpoint
UPDATE manager_dispatches SET work_state = 'open' WHERE state <> 'sent';
--> statement-breakpoint
ALTER TABLE manager_dispatches ADD COLUMN outcomes jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE manager_dispatches ADD COLUMN handled_at timestamptz(3);
--> statement-breakpoint
ALTER TABLE manager_dispatches ADD CONSTRAINT manager_dispatches_work_state_check CHECK (work_state IN ('untracked', 'open', 'handled'));
--> statement-breakpoint
CREATE INDEX manager_dispatches_open_work_idx ON manager_dispatches (project_id, created_at) WHERE work_state = 'open';
