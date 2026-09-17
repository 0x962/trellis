INSERT INTO "chat_channels" ("project_id", "name", "ai_only", "actor_name", "actor_kind", "created_at")
SELECT p.id, c.name, c.name = 'ai', 'trellis', 'system', now() FROM "projects" p CROSS JOIN (VALUES ('ai'), ('general')) AS c(name)
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction",
'Every project tree has a chat room with channels.',
'Every project has its own chat room with channels.'), "updated_at" = now()
WHERE position('Every project tree has a chat room with channels.' IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction",
'Every live agent and manager of the tree receives each post.',
'Every live agent and manager of the project receives each post.'), "updated_at" = now()
WHERE position('Every live agent and manager of the tree receives each post.' IN "instruction") > 0;
