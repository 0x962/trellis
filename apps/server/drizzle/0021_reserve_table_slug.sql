-- `/p/CDE/table` is the table of the project CDE, so a sub-project whose
-- slug is `table` sits at a URL that already belongs to its parent and can
-- never open. The slug joins `board` and `settings` as a name the projects
-- table refuses.
--
-- A root project is caught too, and on purpose. The web route test lower-
-- cases the last path segment before it compares, so a root keyed TABLE
-- sits at /p/TABLE, reads as the table view, and shows the not-found page.
-- A root needs both of its columns changed. pathOf in services/refs.ts
-- builds a root ref from the key column, so a root that changes only its
-- slug clears this block and keeps the URL that has no page.
--
-- A database that already holds such a project cannot take the new rule.
-- This block stops the migration first and names every one of them. The
-- repair is hand-written SQL for every kind of project, because openDatabase
-- runs this migration before the server builds its app, so nothing answers
-- the API while this message stands. The block writes nothing, so the
-- database is unchanged when the install stops.
DO $$
DECLARE
	"held" text;
BEGIN
	WITH RECURSIVE "tree" AS (
		SELECT "id", "slug", "key" AS "path"
		FROM "projects"
		WHERE "parent_id" IS NULL
		UNION ALL
		SELECT "child"."id", "child"."slug", "tree"."path" || '.' || "child"."slug"
		FROM "projects" AS "child"
		JOIN "tree" ON "child"."parent_id" = "tree"."id"
	)
	SELECT string_agg("path", ', ' ORDER BY "path") INTO "held" FROM "tree" WHERE "slug" = 'table';
	IF "held" IS NOT NULL THEN
		RAISE EXCEPTION 'These projects hold the slug "table", which is now a reserved web route: %. The server does not start until no project holds it, and no API answers while this message stands. Change each project with an UPDATE on its projects row. A name with a dot is a sub-project: set its slug to a free slug. A slug is free when no other project under the same parent holds it and it is not board, table, or settings. A name with no dot is a root: set its key to a name that is not a reserved web route, and set its slug to the lower-cased form of that new key. A key is upper case: one letter, then 1 to 9 more letters or digits. A root URL is built from its key, so a root that keeps its key keeps its broken URL. Then run the install again.', "held";
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_slug_check";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_slug_check" CHECK ("projects"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND "projects"."slug" NOT IN ('board', 'table', 'settings'));
