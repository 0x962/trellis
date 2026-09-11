UPDATE "settings"
SET "value" = to_jsonb($${{superset}} ws create --local --project {{projectId}} --name {{name}} --branch {{branch}} --command {{agentCommand}} --json$$::text),
	"updated_at" = NOW()
WHERE "key" = 'agentLaunchCommand'
	AND "value" = to_jsonb($${{superset}} ws create --local --project {{projectId}} --name {{ticket}} - {{name}} --branch {{branch}} --command {{agentCommand}} --json$$::text);
--> statement-breakpoint
UPDATE "agent_runs"
SET "state" = 'failed', "updated_at" = NOW()
WHERE "state" = 'interrupted'
	AND "workspace_id" IS NULL
	AND "terminal_id" IS NULL
	AND "error" LIKE '%Unknown option: -%';
