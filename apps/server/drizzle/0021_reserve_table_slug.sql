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
-- This block stops the migration first and names every one of them, because
-- the person who runs the install has to change them by hand. The block
-- writes nothing, so the database is unchanged when the install stops.
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
		RAISE EXCEPTION 'These projects hold the slug "table", which is now a reserved web route: %. Give a sub-project a new slug. A root project needs an UPDATE on its projects row, because it takes its slug from its key and the API locks the key of a root that has numbered a ticket. Then run the install again.', "held";
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_slug_check";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_slug_check" CHECK ("projects"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND "projects"."slug" NOT IN ('board', 'table', 'settings'));
