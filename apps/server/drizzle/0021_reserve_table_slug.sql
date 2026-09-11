-- `/p/CDE/table` is the table of the project CDE, so a sub-project whose
-- slug is `table` sits at a URL that already belongs to its parent and can
-- never open. The slug joins `board` and `settings` as a name the projects
-- table refuses.
--
-- A root project is caught too, and on purpose. The web route test lower-
-- cases the last path segment before it compares, so a root keyed TABLE
-- sits at /p/TABLE, reads as the table view, and shows the not-found page.
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
		RAISE EXCEPTION 'These projects hold the slug "table", which is now a reserved web route: %. Change the slug of each one with an UPDATE on its projects row, because the server does not start until the slug is free. A name with a dot is a sub-project and takes any free slug. A name with no dot is a root and takes the lower-cased form of its new key. Then run the install again.', "held";
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_slug_check";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_slug_check" CHECK ("projects"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND "projects"."slug" NOT IN ('board', 'table', 'settings'));
