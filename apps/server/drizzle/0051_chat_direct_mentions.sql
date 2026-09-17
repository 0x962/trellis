ALTER TABLE "chat_deliveries" ADD COLUMN "direct" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction",
'Every live agent and manager of the tree receives each post. Mention an agent with @<run id> or @<persona name> to send a post to that agent only.',
'Every live agent and manager of the tree receives each post. Mention an agent with @<run id>, @<persona name>, or @manager to send a post to that agent only. A mention interrupts the current turn of that agent, so mention an agent only when it must act now.'),
"updated_at" = now()
WHERE position('Mention an agent with @<run id> or @<persona name> to send a post to that agent only.' IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction",
'A post that mentions @<run id> or @<persona name> reaches only that agent.',
'A post that mentions @<run id>, @<persona name>, or @manager reaches only that agent and interrupts its current turn. Mention an agent only when it must act now.'),
"updated_at" = now()
WHERE position('A post that mentions @<run id> or @<persona name> reaches only that agent.' IN "instruction") > 0;
