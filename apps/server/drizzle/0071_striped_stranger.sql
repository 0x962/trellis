DROP TABLE "chat_attachments" CASCADE;--> statement-breakpoint
DROP TABLE "chat_channels" CASCADE;--> statement-breakpoint
DROP TABLE "chat_deliveries" CASCADE;--> statement-breakpoint
DROP TABLE "chat_messages" CASCADE;--> statement-breakpoint

UPDATE "projects"
SET "manager_config" = jsonb_set(
	"manager_config",
	'{instruction}',
	to_jsonb(regexp_replace("manager_config"->>'instruction', E'(^|\\n\\n)## Chat room\\n(?:(?!\\n\\n## ).)*(?=\\n\\n## |$)', '', 'g'))
)
WHERE "manager_config"->>'instruction' LIKE '%## Chat room%';--> statement-breakpoint

UPDATE "agent_runs"
SET "instruction" = regexp_replace("instruction", E'(^|\\n\\n)## Chat room\\n(?:(?!\\n\\n## ).)*(?=\\n\\n## |$)', '', 'g')
WHERE "instruction" LIKE '%## Chat room%';--> statement-breakpoint

UPDATE "flow_nodes"
SET "instruction" = regexp_replace("instruction", E'(^|\\n\\n)## Chat room\\n(?:(?!\\n\\n## ).)*(?=\\n\\n## |$)', '', 'g')
WHERE "instruction" LIKE '%## Chat room%';--> statement-breakpoint

UPDATE "flow_executions" AS execution
SET "doc" = jsonb_set(
	execution."doc",
	'{nodes}',
	COALESCE(
		(
			SELECT jsonb_agg(
				node || jsonb_build_object(
					'instruction',
					regexp_replace(node->>'instruction', E'(^|\\n\\n)## Chat room\\n(?:(?!\\n\\n## ).)*(?=\\n\\n## |$)', '', 'g')
				)
				ORDER BY ordinal
			)
			FROM jsonb_array_elements(execution."doc"->'nodes') WITH ORDINALITY AS nodes(node, ordinal)
		),
		'[]'::jsonb
	)
)
WHERE execution."doc"::text LIKE '%## Chat room%';
