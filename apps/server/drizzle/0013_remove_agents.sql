DROP TABLE "agent_cursors";--> statement-breakpoint
DROP TABLE "agent_sessions";--> statement-breakpoint
DELETE FROM "settings" WHERE "key" = 'agents';--> statement-breakpoint
UPDATE "statuses" SET "description" = "seed"."description"
FROM (VALUES
	('Todo', 'todo', 'New work. Read it, ask in a comment when it is unclear, then start a builder.', 'Work awaits its start. Clarify the requirements before work starts.'),
	('In Progress', 'started', 'A builder works on this ticket. Forward each new comment to the builder.', 'Work on this ticket is in progress.'),
	('Agent Review', 'review', 'A builder opened a PR. Run a reviewer.', 'The pull request awaits an agent review.'),
	('Human Review', 'review', 'Waiting for the human reviewer. Do nothing unless they comment.', 'The pull request awaits a human review.'),
	('Done', 'done', 'The work is complete. Close the builder''s workspace.', 'The work is complete.'),
	('Canceled', 'canceled', 'Nobody works on this ticket. Stop its builder and close its workspace.', 'Work on this ticket is canceled.')
) AS "seed" ("name", "category", "previous_description", "description")
WHERE "statuses"."name" = "seed"."name"
	AND "statuses"."category" = "seed"."category"
	AND "statuses"."description" = "seed"."previous_description";
