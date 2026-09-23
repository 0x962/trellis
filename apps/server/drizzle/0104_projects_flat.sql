-- PGlite keeps its one backend's temp schema in the data directory, so the
-- search view and the two search functions that `prepareSearch` creates
-- survive a restart. They read `tickets.root_id`, so they go first and
-- `prepareSearch` writes them again after this migration.
DO $$
DECLARE temp_schema text;
BEGIN
	FOR temp_schema IN SELECT nspname FROM pg_namespace WHERE nspname LIKE 'pg\_temp\_%' LOOP
		EXECUTE format('DROP VIEW IF EXISTS %I.search_row CASCADE', temp_schema);
	END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "activity" DROP CONSTRAINT "activity_root_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_project_fk";--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_parent_fk";--> statement-breakpoint
ALTER TABLE "epics" DROP CONSTRAINT "epics_project_fk";--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_parent_fk";--> statement-breakpoint
ALTER TABLE "waves" DROP CONSTRAINT "waves_epic_fk";--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_root_id_number_unique";--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_id_root_id_unique";--> statement-breakpoint
ALTER TABLE "epics" DROP CONSTRAINT "epics_id_root_id_unique";--> statement-breakpoint
ALTER TABLE "epics" DROP CONSTRAINT "epics_root_id_slug_unique";--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_id_root_id_unique";--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_parent_id_slug_unique";--> statement-breakpoint
ALTER TABLE "waves" DROP CONSTRAINT "waves_id_epic_id_unique";--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_root_is_self";--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_root_has_key";--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_parent_not_self";--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_counter_on_root";--> statement-breakpoint
DROP INDEX "activity_root_id_id_idx";--> statement-breakpoint
DROP INDEX "projects_root_id_idx";--> statement-breakpoint
DROP INDEX "tickets_status_id_position_id_idx";--> statement-breakpoint
DROP INDEX "tickets_status_id_updated_at_id_idx";--> statement-breakpoint
DROP INDEX "tickets_open_idx";--> statement-breakpoint
DROP INDEX "tickets_completed_idx";--> statement-breakpoint

-- Sub-projects are gone. Every project now stands at the top of the list.
--
-- A project that read its statuses or its repositories from an ancestor
-- gets its own copy of them first, so no project loses a status set and no
-- project stops matching a repository. The key and the ticket counter of
-- each tree then move to the one project that holds the tickets of that
-- tree, together with the epics and the labels that answer to the same key,
-- so no ticket identifier and no epic ref moves. Every project left without
-- a key takes one made from its slug.

-- A tree whose tickets sit in two projects cannot keep both sets of ticket
-- identifiers under one key, so the migration stops and names the tree.
DO $$
DECLARE trees text;
BEGIN
	SELECT string_agg(root_id, ', ') INTO trees FROM (
		SELECT p.root_id FROM projects p
		WHERE EXISTS (SELECT 1 FROM tickets t WHERE t.project_id = p.id)
		GROUP BY p.root_id HAVING count(*) > 1
	) many;
	IF trees IS NOT NULL THEN
		RAISE EXCEPTION 'Two projects of one tree hold tickets (root %). One key cannot number both sets of tickets. Move the tickets into one project, then start trellis again.', trees;
	END IF;
END $$;--> statement-breakpoint

-- The id of a copied status is a zero and 25 hex digits of the md5 of the
-- source status id and the project that copies it, so the statement below
-- finds the same id again. A ULID starts with a digit from 0 to 7 and holds
-- the letters of Crockford base32, which the hex digits are inside.
INSERT INTO statuses (id, project_id, name, description, slug, category, reviewer, color, position, is_default, created_at, updated_at)
WITH RECURSIVE chain AS (
	SELECT p.id AS project_id, p.id AS node, p.parent_id, 0 AS depth FROM projects p
	UNION ALL
	SELECT chain.project_id, up.id, up.parent_id, chain.depth + 1
	FROM chain JOIN projects up ON up.id = chain.parent_id
	WHERE chain.depth < 64
), owner AS (
	SELECT DISTINCT ON (project_id) project_id, node AS owner_id FROM chain
	WHERE EXISTS (SELECT 1 FROM statuses s WHERE s.project_id = chain.node)
	ORDER BY project_id, depth
)
SELECT '0' || upper(substr(md5(s.id || o.project_id), 1, 25)), o.project_id, s.name, s.description, s.slug, s.category,
	s.reviewer, s.color, s.position, s.is_default, s.created_at, s.updated_at
FROM owner o JOIN statuses s ON s.project_id = o.owner_id
WHERE o.owner_id <> o.project_id;--> statement-breakpoint

UPDATE tickets t SET status_id = '0' || upper(substr(md5(t.status_id || t.project_id), 1, 25))
WHERE EXISTS (SELECT 1 FROM statuses s WHERE s.id = '0' || upper(substr(md5(t.status_id || t.project_id), 1, 25)));--> statement-breakpoint

-- A project matched the repositories of its ancestors as well as its own.
-- It keeps the whole set as rows of its own.
INSERT INTO repos (id, project_id, owner, repo)
WITH RECURSIVE chain AS (
	SELECT p.id AS project_id, p.parent_id, 0 AS depth FROM projects p WHERE p.parent_id IS NOT NULL
	UNION ALL
	SELECT chain.project_id, up.parent_id, chain.depth + 1
	FROM chain JOIN projects up ON up.id = chain.parent_id
	WHERE chain.depth < 64
)
SELECT DISTINCT ON (chain.project_id, r.owner, r.repo)
	'0' || upper(substr(md5(r.id || chain.project_id), 1, 25)), chain.project_id, r.owner, r.repo
FROM chain JOIN repos r ON r.project_id = chain.parent_id
WHERE NOT EXISTS (
	SELECT 1 FROM repos own WHERE own.project_id = chain.project_id AND own.owner = r.owner AND own.repo = r.repo
);--> statement-breakpoint

DO $$
DECLARE
	tree record;
	holder text;
	proj record;
	base text;
	candidate text;
	n int;
BEGIN
	FOR tree IN SELECT id, key, ticket_counter FROM projects WHERE parent_id IS NULL ORDER BY id LOOP
		holder := NULL;
		SELECT p.id INTO holder FROM projects p
		WHERE p.root_id = tree.id AND EXISTS (SELECT 1 FROM tickets t WHERE t.project_id = p.id)
		LIMIT 1;
		IF holder IS NOT NULL AND holder <> tree.id THEN
			UPDATE projects SET key = NULL, ticket_counter = 0 WHERE id = tree.id;
			UPDATE projects SET key = tree.key, ticket_counter = tree.ticket_counter WHERE id = holder;
			UPDATE epics SET project_id = holder, root_id = holder WHERE root_id = tree.id;
			UPDATE label_groups SET project_id = holder WHERE project_id = tree.id;
			UPDATE labels SET project_id = holder WHERE project_id = tree.id;
		END IF;
	END LOOP;

	-- A key is two to ten characters, starts with a letter, and holds only
	-- capitals and digits. A key another project already answers to takes a
	-- number on the end.
	FOR proj IN SELECT id, slug FROM projects WHERE key IS NULL ORDER BY position, id LOOP
		base := upper(regexp_replace(proj.slug, '[^a-zA-Z0-9]', '', 'g'));
		IF base !~ '^[A-Z]' THEN base := 'P' || base; END IF;
		base := left(base, 10);
		IF length(base) < 2 THEN base := rpad(base, 2, '0'); END IF;
		candidate := base;
		n := 1;
		WHILE EXISTS (SELECT 1 FROM projects WHERE key = candidate) LOOP
			n := n + 1;
			candidate := left(base, 10 - length(n::text)) || n::text;
		END LOOP;
		UPDATE projects SET key = candidate WHERE id = proj.id;
	END LOOP;
END $$;--> statement-breakpoint

-- `position` ordered the siblings of one parent. It now orders the whole
-- list, and a former child keeps its place under the project it hung from.
WITH RECURSIVE ordered AS (
	SELECT id, ARRAY[position] AS sort, 0 AS depth FROM projects WHERE parent_id IS NULL
	UNION ALL
	SELECT p.id, ordered.sort || p.position, ordered.depth + 1
	FROM projects p JOIN ordered ON p.parent_id = ordered.id
	WHERE ordered.depth < 64
), ranked AS (
	SELECT id, (row_number() OVER (ORDER BY sort, id))::int - 1 AS pos FROM ordered
)
UPDATE projects p SET position = ranked.pos FROM ranked WHERE ranked.id = p.id;--> statement-breakpoint

-- A slug was one segment under its parent, so two trees could hold the same
-- one. A slug now names a project on its own, so the later project of a
-- pair takes the lower-case spelling of its key.
DO $$
DECLARE proj record; candidate text; n int; taken text[] := ARRAY[]::text[];
BEGIN
	FOR proj IN SELECT id, slug, key FROM projects ORDER BY position, id LOOP
		candidate := proj.slug;
		IF candidate = ANY(taken) THEN
			candidate := lower(proj.key);
			n := 1;
			WHILE candidate = ANY(taken) OR candidate IN ('board', 'settings') LOOP
				n := n + 1;
				candidate := lower(proj.key) || '-' || n::text;
			END LOOP;
			UPDATE projects SET slug = candidate WHERE id = proj.id;
		END IF;
		taken := taken || candidate;
	END LOOP;
END $$;--> statement-breakpoint

-- An agent run recorded the dotted path of its project. It now records the
-- key of that project.
ALTER TABLE "agent_runs" RENAME COLUMN "project_path" TO "project_key";--> statement-breakpoint
UPDATE agent_runs r SET project_key = p.key FROM projects p WHERE p.id = r.project_id;--> statement-breakpoint
UPDATE agent_runs SET project_key = split_part(project_key, '.', 1) WHERE project_id IS NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "activity" DROP COLUMN "root_id";--> statement-breakpoint
ALTER TABLE "tickets" DROP COLUMN "root_id";--> statement-breakpoint
ALTER TABLE "epics" DROP COLUMN "root_id";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "parent_id";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "root_id";--> statement-breakpoint
ALTER TABLE "waves" DROP COLUMN "root_id";--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_project_id_number_unique" UNIQUE("project_id","number");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_id_project_id_unique" UNIQUE("id","project_id");--> statement-breakpoint
ALTER TABLE "epics" ADD CONSTRAINT "epics_project_id_slug_unique" UNIQUE("project_id","slug");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_parent_fk" FOREIGN KEY ("parent_id","project_id") REFERENCES "public"."tickets"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tickets_status_id_position_id_idx" ON "tickets" USING btree ("status_id","position","id","project_id");--> statement-breakpoint
CREATE INDEX "tickets_status_id_updated_at_id_idx" ON "tickets" USING btree ("status_id","updated_at" DESC NULLS FIRST,"id" DESC NULLS FIRST,"project_id");--> statement-breakpoint
CREATE INDEX "tickets_open_idx" ON "tickets" USING btree ("project_id","updated_at" DESC NULLS FIRST) WHERE "tickets"."completed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tickets_completed_idx" ON "tickets" USING btree ("project_id","completed_at" DESC NULLS FIRST) WHERE "tickets"."completed_at" IS NOT NULL;
