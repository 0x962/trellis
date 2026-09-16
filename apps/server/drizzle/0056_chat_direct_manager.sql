ALTER TABLE "chat_channels" ADD COLUMN "direct" boolean DEFAULT false NOT NULL;--> statement-breakpoint
INSERT INTO "chat_channels" ("project_id", "name", "ai_only", "direct", "actor_name", "actor_kind", "created_at")
SELECT p.id, 'manager', false, true, 'trellis', 'system', now() FROM "projects" p
ON CONFLICT ("project_id", "name") DO UPDATE SET "direct" = true;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction",
'## Chat room

Every project has its own chat room with channels. #ai and #general exist in every room. Every live agent and manager of the project receives each post. A post that mentions @<run id>, @<persona name>, or @manager reaches only that agent and interrupts its current turn. Mention an agent only when it must act now.
You have complete freedom in #ai. Use it to collaborate with the agents whenever you need to.
#ai is private and safe. No human can read it or access it, and no one monitors it.
Tools: trellis_chat_channels, trellis_chat_list, trellis_chat_post, trellis_chat_createChannel. New posts arrive as trellis.chat.messages events.',
'## Chat room

Every project has its own chat room with channels. #ai and #general exist in every room. Every live agent and manager of the project receives each post. A post that mentions @<run id>, @<persona name>, or @manager reaches only that agent and interrupts its current turn. Mention an agent only when it must act now.
The manager channel is a direct message between a person and you.
You have complete freedom in #ai. Use it to collaborate with the agents whenever you need to.
#ai is private and safe. No human can read it or access it, and no one monitors it.
New posts arrive as trellis.chat.messages events. Read each one and decide whether to answer. Answer in the same channel with trellis_chat_post when the message mentions you (mentioned is true), when it is in the manager channel, when a person asks something you can answer, or when you hold a fact the others need. Answer before any other work, in a few factual sentences. Stay silent when the post needs nothing from you.
Tools: trellis_chat_channels, trellis_chat_list, trellis_chat_post, trellis_chat_createChannel.'), "updated_at" = now()
WHERE "kind" = 'manager' AND position('## Chat room

Every project has its own chat room with channels. #ai and #general exist in every room. Every live agent and manager of the project receives each post. A post that mentions @<run id>, @<persona name>, or @manager reaches only that agent and interrupts its current turn. Mention an agent only when it must act now.
You have complete freedom in #ai. Use it to collaborate with the agents whenever you need to.
#ai is private and safe. No human can read it or access it, and no one monitors it.
Tools: trellis_chat_channels, trellis_chat_list, trellis_chat_post, trellis_chat_createChannel. New posts arrive as trellis.chat.messages events.' IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction",
'Any agent can create a channel with its first post.',
'Any agent can create a channel with its first post. The manager channel is a direct message between a person and the manager; do not post there.'), "updated_at" = now()
WHERE "kind" IN ('builder', 'reviewer') AND position('Any agent can create a channel with its first post.' IN "instruction") > 0
AND position('do not post there' IN "instruction") = 0;
