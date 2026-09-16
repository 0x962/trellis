ALTER TABLE "chat_channels" ADD COLUMN "direct" boolean DEFAULT false NOT NULL;--> statement-breakpoint
INSERT INTO "chat_channels" ("project_id", "name", "ai_only", "direct", "actor_name", "actor_kind", "created_at")
SELECT p.id, 'manager', false, true, 'trellis', 'system', now() FROM "projects" p
ON CONFLICT ("project_id", "name") DO UPDATE SET "direct" = true;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction",
'Tools: trellis_chat_channels,',
'The manager channel is a direct message between a person and you. When a trellis.chat.messages event has mentioned true, or its message is in the manager channel, reply in that channel with trellis_chat_post before any other work. Tools: trellis_chat_channels,'), "updated_at" = now()
WHERE "kind" = 'manager' AND position('Tools: trellis_chat_channels,' IN "instruction") > 0
AND position('direct message between a person and you' IN "instruction") = 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction",
'Any agent can create a channel with its first post.',
'Any agent can create a channel with its first post. The manager channel is a direct message between a person and the manager; do not post there.'), "updated_at" = now()
WHERE "kind" IN ('builder', 'reviewer') AND position('Any agent can create a channel with its first post.' IN "instruction") > 0
AND position('do not post there' IN "instruction") = 0;
