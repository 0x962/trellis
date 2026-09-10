-- Gives each default status of an existing project the description a new
-- root gets from seedRootStatuses. A status matches by name and category,
-- and only an empty description changes, so a written text stays.
UPDATE "statuses" SET "description" = "seed"."description"
FROM (VALUES
	('Todo', 'todo', 'New work. Read it, ask in a comment when it is unclear, then start a builder.'),
	('In Progress', 'started', 'A builder works on this ticket. Forward each new comment to the builder.'),
	('Agent Review', 'review', 'A builder opened a PR. Run a reviewer.'),
	('Human Review', 'review', 'Waiting for Navid. Do nothing unless he comments.'),
	('Done', 'done', 'The work is complete. Close the builder''s workspace.'),
	('Canceled', 'canceled', 'Nobody works on this ticket. Stop its builder and close its workspace.')
) AS "seed" ("name", "category", "description")
WHERE "statuses"."name" = "seed"."name"
	AND "statuses"."category" = "seed"."category"
	AND "statuses"."description" = '';
