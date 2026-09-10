ALTER TABLE "agent_sessions" ADD COLUMN "name" text;--> statement-breakpoint
-- Gives each stored session the person name that a human calls the agent
-- by. A row takes the name of its place in the creation order of its
-- project, so the live agents of a project hold different names. The list
-- here is a copy of part of AGENT_PERSON_NAMES: a migration keeps the
-- names it ran with.
WITH "pool" AS (
	SELECT "person", "slot" - 1 AS "slot"
	FROM (VALUES
		('Amara', 1), ('Kenji', 2), ('Salma', 3), ('Nadia', 4), ('Kwame', 5), ('Astrid', 6),
		('Ravi', 7), ('Meera', 8), ('Tariq', 9), ('Aoife', 10), ('Thiago', 11), ('Yuki', 12),
		('Zola', 13), ('Magnus', 14), ('Priya', 15), ('Emeka', 16), ('Ingrid', 17), ('Hasan', 18),
		('Xochitl', 19), ('Tenzin', 20), ('Fatou', 21), ('Lorenzo', 22), ('Oksana', 23), ('Kofi', 24)
	) AS "names" ("person", "slot")
), "ordered" AS (
	SELECT "id", (row_number() OVER (PARTITION BY "project_id" ORDER BY "created_at", "id") - 1)
		% (SELECT count(*) FROM "pool") AS "slot"
	FROM "agent_sessions"
)
UPDATE "agent_sessions" SET "name" = "pool"."person"
FROM "ordered", "pool"
WHERE "agent_sessions"."id" = "ordered"."id" AND "pool"."slot" = "ordered"."slot";--> statement-breakpoint
ALTER TABLE "agent_sessions" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_name_check" CHECK (char_length("agent_sessions"."name") BETWEEN 1 AND 40);
