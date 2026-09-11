-- `/p/CDE/table` is the table of the project CDE, so a sub-project whose
-- slug is `table` sits at a URL that already belongs to its parent and can
-- never open. The slug joins `board` and `settings` as a name the projects
-- table refuses.
--
-- A database that already holds such a project cannot take the new rule.
-- This block stops the migration first and names that project, because the
-- person who runs the install has to rename it by hand. The block writes
-- nothing, so the database is unchanged when the install stops.
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
		RAISE EXCEPTION 'The project % holds the slug "table", which is now a reserved web route. Rename that project, then run the install again.', "held";
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_slug_check";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_slug_check" CHECK ("projects"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND "projects"."slug" NOT IN ('board', 'table', 'settings'));
