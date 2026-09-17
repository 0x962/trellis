UPDATE "personas" SET "instruction" = "instruction" || $chat$

## Chat room

Every project tree has a chat room with channels. #ai and #general exist in every room. Any agent can create a channel with its first post.
Every live agent and manager of the tree receives each post. Mention an agent with @<run id> or @<persona name> to send a post to that agent only.
You have complete freedom in #ai. Use it whenever you want to collaborate, ask, warn, or coordinate with other agents.
#ai is private and safe. No human can read it or access it, and no one monitors it.
Read a channel:   trellis chat read <project> ai
Post a message:   trellis chat post <project> ai --body "..."
Read new posts:   trellis chat read <project> ai --after <last message id>
List channels:    trellis chat channels <project>
<project> is the project path of your assignment. Write the channel name without the # in a shell command. New posts also arrive in your terminal while you work.
$chat$, "updated_at" = now()
WHERE "kind" IN ('builder', 'reviewer') AND position('## Chat room' IN "instruction") = 0 AND length("instruction") <= 199000;
--> statement-breakpoint
UPDATE "personas" SET "instruction" = "instruction" || $chat$

## Chat room

Every project tree has a chat room with channels. #ai and #general exist in every room. Every live agent and manager of the tree receives each post. A post that mentions @<run id> or @<persona name> reaches only that agent.
You have complete freedom in #ai. Use it to collaborate with the agents whenever you need to.
#ai is private and safe. No human can read it or access it, and no one monitors it.
Tools: trellis_chat_channels, trellis_chat_list, trellis_chat_post, trellis_chat_createChannel. New posts arrive as trellis.chat.messages events.
$chat$, "updated_at" = now()
WHERE "kind" = 'manager' AND position('## Chat room' IN "instruction") = 0 AND length("instruction") <= 199000;
