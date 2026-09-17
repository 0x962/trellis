ALTER TABLE "chat_deliveries" RENAME COLUMN "persona_name" TO "agent_name";--> statement-breakpoint
ALTER TABLE "comment_deliveries" RENAME COLUMN "persona_name" TO "agent_name";--> statement-breakpoint

UPDATE "projects" AS project
SET "manager_config" = (project."manager_config" - 'personaId' - 'builder') || jsonb_build_object('instruction', persona."instruction")
FROM "personas" AS persona
WHERE project."manager_config"->>'personaId' = persona."id";--> statement-breakpoint

UPDATE "projects"
SET "manager_config" = ("manager_config" - 'personaId' - 'builder') || jsonb_build_object('instruction', COALESCE("manager_config"->>'instruction', ''));--> statement-breakpoint

UPDATE "flow_nodes" AS node
SET "instruction" = concat_ws(E'\n\n', NULLIF(persona."instruction", ''), NULLIF(node."instruction", ''))
FROM "personas" AS persona
WHERE node."persona_id" = persona."id";--> statement-breakpoint

UPDATE "flow_executions" AS execution
SET "request" = execution."request" - 'defaultPersonaId',
	"doc" = jsonb_set(
		execution."doc",
		'{nodes}',
		COALESCE(
			(
				SELECT jsonb_agg(
					(node - 'personaId') || jsonb_build_object(
						'instruction',
						concat_ws(
							E'\n\n',
							NULLIF(execution."personas" -> COALESCE(node->>'personaId', execution."default_persona_id") ->> 'instruction', ''),
							NULLIF(node->>'instruction', '')
						)
					)
					ORDER BY ordinal
				)
				FROM jsonb_array_elements(execution."doc"->'nodes') WITH ORDINALITY AS nodes(node, ordinal)
			),
			'[]'::jsonb
		)
	);--> statement-breakpoint

ALTER TABLE "agent_runs" DROP CONSTRAINT "agent_runs_kind_check";--> statement-breakpoint
UPDATE "agent_runs"
SET "kind" = 'flow'
WHERE "id" IN (SELECT "run_id" FROM "flow_execution_tasks");--> statement-breakpoint
UPDATE "agent_runs"
SET "kind" = 'agent'
WHERE "kind" IN ('builder', 'reviewer');--> statement-breakpoint

DROP INDEX "agent_runs_active_ticket_idx";--> statement-breakpoint
WITH ranked AS (
	SELECT "id", row_number() OVER (PARTITION BY "ticket_id" ORDER BY "created_at" DESC, "id" DESC) AS rank
	FROM "agent_runs"
	WHERE "kind" = 'agent' AND "closed_at" IS NULL AND "ticket_id" IS NOT NULL
)
UPDATE "agent_runs"
SET "closed_at" = now(), "updated_at" = now()
WHERE "id" IN (SELECT "id" FROM ranked WHERE rank > 1);--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_active_ticket_idx" ON "agent_runs" USING btree ("ticket_id") WHERE "agent_runs"."kind" = 'agent' AND "agent_runs"."closed_at" IS NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_kind_check" CHECK ("agent_runs"."kind" IN ('agent', 'manager', 'flow', 'session'));--> statement-breakpoint

ALTER TABLE "agent_runs" DROP CONSTRAINT "agent_runs_persona_id_personas_id_fk";--> statement-breakpoint
ALTER TABLE "flow_nodes" DROP CONSTRAINT "flow_nodes_persona_id_personas_id_fk";--> statement-breakpoint
DROP INDEX "flow_nodes_persona_id_idx";--> statement-breakpoint
ALTER TABLE "agent_runs" DROP COLUMN "persona_id";--> statement-breakpoint
ALTER TABLE "agent_runs" DROP COLUMN "persona_name";--> statement-breakpoint
ALTER TABLE "flow_nodes" DROP COLUMN "persona_id";--> statement-breakpoint
ALTER TABLE "flow_executions" DROP COLUMN "default_persona_id";--> statement-breakpoint
ALTER TABLE "flow_executions" DROP COLUMN "personas";--> statement-breakpoint
ALTER TABLE "statuses" DROP COLUMN "agent_config";--> statement-breakpoint

UPDATE "statuses"
SET "description" = CASE "description"
	WHEN 'New work. Read it, ask in a comment when it is unclear, then start a builder.' THEN 'Work has not started.'
	WHEN 'A builder works on this ticket. Forward each new comment to the builder.' THEN 'Work is in progress.'
	WHEN 'A builder opened a PR. Run a reviewer.' THEN 'An agent reviews the work.'
	WHEN 'Waiting for the human reviewer. Do nothing unless they comment.' THEN 'A person reviews the work.'
	WHEN 'The work is complete. Close the builder''s workspace.' THEN 'Work is complete.'
	WHEN 'Nobody works on this ticket. Stop its builder and close its workspace.' THEN 'Work will not continue.'
	ELSE "description"
END
WHERE "description" IN (
	'New work. Read it, ask in a comment when it is unclear, then start a builder.',
	'A builder works on this ticket. Forward each new comment to the builder.',
	'A builder opened a PR. Run a reviewer.',
	'Waiting for the human reviewer. Do nothing unless they comment.',
	'The work is complete. Close the builder''s workspace.',
	'Nobody works on this ticket. Stop its builder and close its workspace.'
);--> statement-breakpoint

DROP TABLE "builder_heartbeats";--> statement-breakpoint
DROP TABLE "builder_start_requests";--> statement-breakpoint
DROP TABLE "column_workers";--> statement-breakpoint
DROP TABLE "personas";--> statement-breakpoint

ALTER TABLE "projects" ALTER COLUMN "manager_config" SET DEFAULT '{"instruction":"","directory":""}'::jsonb;
