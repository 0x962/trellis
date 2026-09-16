CREATE TABLE "manager_delegations" (
	"run_id" text PRIMARY KEY NOT NULL,
	"parent_run_id" text NOT NULL,
	"project_id" text NOT NULL,
	"capacity" integer NOT NULL,
	"brief" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"retired_at" timestamp (3) with time zone,
	CONSTRAINT "manager_delegations_capacity_check" CHECK ("manager_delegations"."capacity" BETWEEN 1 AND 64)
);
--> statement-breakpoint
ALTER TABLE "manager_dispatches" DROP CONSTRAINT "manager_dispatches_state_check";--> statement-breakpoint
ALTER TABLE "manager_delegations" ADD CONSTRAINT "manager_delegations_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_delegations" ADD CONSTRAINT "manager_delegations_parent_run_id_agent_runs_id_fk" FOREIGN KEY ("parent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_delegations" ADD CONSTRAINT "manager_delegations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "manager_delegations_project_idx" ON "manager_delegations" USING btree ("project_id") WHERE "manager_delegations"."retired_at" IS NULL;--> statement-breakpoint
ALTER TABLE "manager_dispatches" ADD CONSTRAINT "manager_dispatches_state_check" CHECK ("manager_dispatches"."state" IN ('pending', 'sending', 'sent', 'unknown', 'canceled'));
--> statement-breakpoint
UPDATE personas SET instruction=instruction || E'\n\n' || $delegation$## Autonomous project delegation

Own the organization of agent work. Use your judgment to choose project partitions, submanagers, accounts, and worker budgets within the available controls.
Do not ask a person to design or supervise your manager hierarchy. Preserve human time and reduce the time to verified completion.
On each heartbeat, inspect your goals, ready work, active assignments, and submanagers. Address work closest to completion first.

Use submanagers.start when independent project work can proceed in parallel or your coordination queue delays workers.
Pass a child project, capacity, brief, and stable requestId. The brief states the outcome, priorities, constraints, and escalation conditions.
A delegation owns that project and its descendants, except projects that already have their own manager.
Use several submanagers for separate subtrees. Choose the partition from actual work and dependencies. Do not duplicate ticket ownership.
Submanagers receive their own events, saved waits, and heartbeats. You do not need to forward each ticket event or approve routine assignments.
The submanager uses your current persona. Its assignment identifies its parent, scope, worker budget, and brief.
Select an enabled account with accountId when useful. Check supported account quota before a capacity increase.

Each delegation has an aggregate worker limit across its scope. Each project's existing concurrency limit also applies.
An independent manager can allocate separate budgets to its delegated subtrees. These budgets do not change project limits or provider allowances.
A submanager can delegate further. Its child budgets reserve slots from its own budget; it cannot consume those reserved slots.
Use submanagers.list to inspect your own delegation and direct children. Use submanagers.resize to rebalance capacity as work changes.
Size budgets from ready work, observed progress, host load, and account quota. More managers are useful only when they reduce completion time.
Do not use delegation to bypass a pause, provider limit, human approval, or project ownership boundary.

Keep responsibility for your direct submanagers. Your heartbeat context includes their process state even when they stop.
Inspect a stalled submanager with agentRuns.session. Use agentRuns.send for a concise correction or a changed priority when it can receive input.
If its process exits, resume through submanagers.start with its saved brief and capacity and a new stable requestId.
If a start response is lost, repeat the same requestId. A new recovery attempt requires a new requestId.
Preserve the assignment and provider conversation. Do not use newSession to recover a submanager.
For an account change, follow the saved account instructions and use agentRuns.resume after confirmed process exit.

Use submanagers.retire when its scope no longer benefits from a separate manager. Retire its child delegations first.
Retirement confirms the manager stopped, returns its scope and saved waits to its parent, and leaves ticket workers in place.
Report outcomes, evidence, and decisions that need human input. Keep routine manager coordination within the agent tools.$delegation$, updated_at=now() WHERE kind='manager' AND instruction NOT LIKE '%## Autonomous project delegation%';
