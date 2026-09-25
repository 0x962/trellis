import { afterAll, beforeAll, expect, test } from "bun:test";
import { type InternalLinkType, internalLink } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { openTestDb } from "../../db/testDb.ts";
import { resolve } from "./internalLinks.ts";

const at = new Date("2026-09-25T12:00:00.000Z");
const ids = {
	project: ulid(),
	status: ulid(),
	page: ulid(),
	pullRequest: ulid(),
	ticket: ulid(),
	epic: ulid(),
	resource: ulid(),
	run: ulid(),
	session: ulid(),
};
let db: Awaited<ReturnType<typeof openTestDb>>;

const pathOf = (type: InternalLinkType, id: string) =>
	db.transaction((tx) => resolve({} as ServiceCtx, tx, { link: internalLink(type, id) }));

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES ('Navid', 'human', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${ids.project}, 'TRL', 'trellis', 'Trellis', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${ids.status}, ${ids.project}, 'Todo', 'todo', 'todo', 'neutral', 0, true, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets
		(id, project_id, number, title, status_id, position, created_at, updated_at)
		VALUES (${ids.ticket}, ${ids.project}, 480, 'Stable links', ${ids.status}, 0, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO epics
		(id, project_id, slug, name, actor_name, actor_kind, created_at, updated_at)
		VALUES (${ids.epic}, ${ids.project}, 'internal-links', 'Internal links', 'Navid', 'human', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO epic_resources
		(id, epic_id, kind, name, body, actor_name, actor_kind, created_at, updated_at)
		VALUES (${ids.resource}, ${ids.epic}, 'doc', 'Contract', 'Stable links', 'Navid', 'human', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO pages
		(id, project_id, slug, title, creator_actor_name, creator_actor_kind,
		 actor_name, actor_kind, created_at, updated_at)
		VALUES (${ids.page}, ${ids.project}, 'link-guide', 'Link guide', 'Navid', 'human',
		 'Navid', 'human', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO pull_requests
		(id, owner, repo, number, url, state, created_at, updated_at)
		VALUES (${ids.pullRequest}, 'acme', 'app', 12, 'https://github.com/acme/app/pull/12', 'open', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_key, created_at, updated_at)
		VALUES (${ids.run}, 'Session', 'session', 'Test links.', '', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO sessions
		(id, name, directory, harness, run_id, created_at, updated_at)
		VALUES (${ids.session}, 'Link work', '/tmp/link-work', '{"preset":"codex"}'::jsonb, ${ids.run}, ${at}, ${at})`);
}, 30_000);

afterAll(async () => db.$client.close());

test("resolves every supported record ID to its current route", async () => {
	expect(await pathOf("page", ids.page)).toEqual({ path: "/p/TRL/pages/link-guide" });
	expect(await pathOf("pr", ids.pullRequest)).toEqual({ path: "/reviews/acme/app/12" });
	expect(await pathOf("ticket", ids.ticket)).toEqual({ path: "/t/TRL-480" });
	expect(await pathOf("resource", ids.resource)).toEqual({
		path: `/p/TRL/epics/internal-links?tab=resources#${ids.resource}`,
	});
	expect(await pathOf("epic", ids.epic)).toEqual({ path: "/p/TRL/epics/internal-links" });
	expect(await pathOf("session", ids.session)).toEqual({ path: `/sessions/${ids.session}` });
});

test("keeps each link after route names change", async () => {
	await db.execute(
		sql`UPDATE projects SET key = 'NEW', slug = 'new-project', name = 'New project' WHERE id = ${ids.project}`,
	);
	await db.execute(sql`UPDATE pages SET slug = 'renamed-page', title = 'Renamed Page' WHERE id = ${ids.page}`);
	await db.execute(sql`UPDATE epics SET slug = 'renamed-epic', name = 'Renamed epic' WHERE id = ${ids.epic}`);
	await db.execute(sql`UPDATE pull_requests SET owner = 'other', repo = 'renamed', number = 99,
		url = 'https://github.com/other/renamed/pull/99' WHERE id = ${ids.pullRequest}`);
	await db.execute(sql`UPDATE sessions SET name = 'Renamed session' WHERE id = ${ids.session}`);

	expect(await pathOf("page", ids.page)).toEqual({ path: "/p/NEW/pages/renamed-page" });
	expect(await pathOf("pr", ids.pullRequest)).toEqual({ path: "/reviews/other/renamed/99" });
	expect(await pathOf("ticket", ids.ticket)).toEqual({ path: "/t/NEW-480" });
	expect(await pathOf("resource", ids.resource)).toEqual({
		path: `/p/NEW/epics/renamed-epic?tab=resources#${ids.resource}`,
	});
	expect(await pathOf("epic", ids.epic)).toEqual({ path: "/p/NEW/epics/renamed-epic" });
	expect(await pathOf("session", ids.session)).toEqual({ path: `/sessions/${ids.session}` });
});

test("reports a deleted Page and a missing record", async () => {
	await db.execute(sql`UPDATE pages SET deleted_at = ${at}, deleted_actor_name = 'Navid',
		deleted_actor_kind = 'human' WHERE id = ${ids.page}`);

	await expect(pathOf("page", ids.page)).rejects.toMatchObject({ code: "PAGE_DELETED" });
	await expect(pathOf("resource", ulid())).rejects.toMatchObject({
		code: "NOT_FOUND",
		message: "This resource does not exist or is unavailable.",
	});
});
