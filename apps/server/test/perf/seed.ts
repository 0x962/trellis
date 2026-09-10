import { sql } from "drizzle-orm";
import { type StatusIds, seedActors, seedChild, seedRoot, seedStatuses } from "../fixtures";
import { freshDb, type TestDb } from "../helpers/db.ts";

type Db = TestDb["db"];

// The number of tickets a perf run seeds. The scripts set it: `perf:10k`
// seeds 10 000 inside `bun run check`, `perf` seeds 50 000. Unset, every
// perf test skips.
export const PERF_ROWS = Number(process.env.TRELLIS_PERF_ROWS ?? 0);

// The budgets of plan.md are for Navid's Mac. CI sets
// TRELLIS_PERF_FACTOR=2.5 and runs the same tests at 2.5 times each budget.
// turbo passes every TRELLIS_* variable to a task, and filters out `CI`.
export const BUDGET_FACTOR = Number(process.env.TRELLIS_PERF_FACTOR ?? 1);

export type PerfRoot = { key: string; rootId: string; projectIds: string[]; statuses: StatusIds };

const ROOT_KEYS = ["AAA", "BBB", "CCC"] as const;
const PROJECTS_PER_ROOT = 8;
const ACTIVITY_PER_TICKET = 10;
const COMMENTS_PER_TICKET = 2;
const OPEN_PRS = 40;

// Sixty words the titles, descriptions, and comments draw from, so a search
// for one word hits about one ticket in sixty.
const WORDS = sql.raw(
	`ARRAY[${[
		"auth",
		"billing",
		"login",
		"token",
		"session",
		"invoice",
		"webhook",
		"retry",
		"queue",
		"cache",
		"index",
		"schema",
		"migration",
		"deploy",
		"rollback",
		"canary",
		"metric",
		"alert",
		"dashboard",
		"report",
		"export",
		"import",
		"upload",
		"download",
		"avatar",
		"profile",
		"settings",
		"theme",
		"keyboard",
		"palette",
		"search",
		"filter",
		"sort",
		"cursor",
		"page",
		"board",
		"column",
		"card",
		"drag",
		"drop",
		"comment",
		"mention",
		"notify",
		"email",
		"digest",
		"poller",
		"github",
		"review",
		"approve",
		"merge",
		"branch",
		"commit",
		"diff",
		"check",
		"workflow",
		"runner",
		"secret",
		"config",
		"flag",
		"rollout",
	]
		.map((word) => `'${word}'`)
		.join(", ")}]::text[]`,
);

// A deterministic database of `tickets` tickets: 3 roots x 8 projects, 10
// activity rows and 2 comments per ticket, a 2 KB description, 40 open
// pull requests on the first tickets, then VACUUM (ANALYZE). Every row derives from
// its ticket number, so two seeds of the same size are equal. Every id is
// 26 digits that pass the ULID schema of the API, so each answer passes its
// output validation. The first digit names the table: 0 tickets,
// 1 comments, 2 pull requests, 3 activity batches. The second digit of a
// ticket id is the index of its root.
export const perfSeed = async (db: Db, tickets: number): Promise<PerfRoot[]> => {
	await seedActors(db);
	const roots: PerfRoot[] = [];
	for (const key of ROOT_KEYS) {
		const rootId = await seedRoot(db, key);
		const projectIds = [rootId];
		for (let i = 1; i < PROJECTS_PER_ROOT; i++) projectIds.push(await seedChild(db, rootId, rootId, `p${i}`));
		roots.push({ key, rootId, projectIds, statuses: await seedStatuses(db, rootId) });
	}
	const perRoot = Math.ceil(tickets / roots.length);
	for (const [index, root] of roots.entries()) {
		const projects = sql`${sql.param(root.projectIds)}::text[]`;
		const statuses = sql`${sql.param(Object.values(root.statuses))}::text[]`;
		const prefix = `0${index}`;
		await db.execute(sql`
			INSERT INTO tickets (id, project_id, root_id, number, title, description, priority, status_id, parent_id,
				position, version, started_at, completed_at, created_at, updated_at)
			SELECT
				${prefix} || lpad(n::text, 24, '0'),
				(${projects})[(n % ${PROJECTS_PER_ROOT}) + 1],
				${root.rootId},
				n,
				(${WORDS})[(n % 60) + 1] || ' ' || (${WORDS})[((n * 7) % 60) + 1] || ' ' || (${WORDS})[((n * 13) % 60) + 1] || ' ' || n,
				repeat((${WORDS})[((n * 3) % 60) + 1] || ' ' || (${WORDS})[((n * 11) % 60) + 1] || ' ', 190),
				(ARRAY['none', 'urgent', 'high', 'medium', 'low'])[(n % 5) + 1],
				(${statuses})[(n % 6) + 1],
				NULL,
				n * 1024,
				1,
				CASE WHEN n % 6 = 0 THEN NULL ELSE now() - (n % 100000) * interval '1 second' - interval '2 days' END,
				CASE WHEN n % 6 IN (4, 5) THEN now() - (n % 100000) * interval '1 second' ELSE NULL END,
				now() - (n % 100000) * interval '1 second' - interval '3 days',
				now() - (n % 100000) * interval '1 second'
			FROM generate_series(1, ${perRoot}) AS n`);
	}
	await db.execute(sql`
		INSERT INTO activity (batch_id, root_id, project_id, ticket_id, actor_name, actor_kind, action, field,
			from_value, to_value, meta, created_at)
		SELECT
			'3' || substr(t.id, 2, 1) || lpad(t.number::text, 19, '0') || lpad(i::text, 5, '0'),
			t.root_id, t.project_id, t.id,
			CASE WHEN i % 2 = 0 THEN 'navid' ELSE 'claude' END,
			CASE WHEN i % 2 = 0 THEN 'human' ELSE 'agent' END,
			CASE WHEN i = 1 THEN 'ticket.created' ELSE 'ticket.updated' END,
			CASE WHEN i = 1 THEN NULL ELSE 'priority' END,
			CASE WHEN i = 1 THEN NULL ELSE 'none' END,
			CASE WHEN i = 1 THEN NULL ELSE 'high' END,
			'{}'::jsonb,
			t.created_at + i * interval '1 hour'
		FROM tickets t, generate_series(1, ${ACTIVITY_PER_TICKET}) AS i`);
	await db.execute(sql`
		INSERT INTO comments (id, ticket_id, body, actor_name, actor_kind, created_at, updated_at)
		SELECT
			'1' || substr(t.id, 2, 1) || lpad(t.number::text, 23, '0') || i,
			t.id,
			(${WORDS})[((t.number * i * 17) % 60) + 1] || ' ' || (${WORDS})[((t.number + i) % 60) + 1] || ' broke on ' || t.number,
			CASE WHEN i = 1 THEN 'claude' ELSE 'navid' END,
			CASE WHEN i = 1 THEN 'agent' ELSE 'human' END,
			t.created_at + interval '1 day',
			t.created_at + interval '1 day'
		FROM tickets t, generate_series(1, ${COMMENTS_PER_TICKET}) AS i`);
	await db.execute(sql`
		INSERT INTO pull_requests (id, owner, repo, number, url, title, state, is_draft, head_ref, base_ref, review_state,
			checks, ci_state, created_at, updated_at)
		SELECT
			'2' || lpad(n::text, 25, '0'), 'acme', 'web', n, 'https://github.com/acme/web/pull/' || n, 'PR ' || n,
			'open', false, 'feature-' || n, 'main', 'none',
			'[{"name":"ci","workflow":"CI","bucket":"pass","link":null}]'::jsonb,
			CASE WHEN n % 4 = 0 THEN 'fail' ELSE 'pass' END,
			now(), now()
		FROM generate_series(1, ${OPEN_PRS}) AS n`);
	await db.execute(sql`
		INSERT INTO ticket_pull_requests (ticket_id, pull_request_id, source, actor_name, actor_kind, created_at)
		SELECT '00' || lpad(n::text, 24, '0'), '2' || lpad(n::text, 25, '0'), 'manual', 'navid', 'human', now()
		FROM generate_series(1, ${OPEN_PRS}) AS n`);
	// A real home is vacuumed by the maintenance timer after 1000 writes, and
	// the cached perf home by its build step. VACUUM sets the visibility map,
	// which lets an index-only scan skip the table row. An unvacuumed seed
	// measures a state a person never sits in for long.
	await db.execute(sql`VACUUM (ANALYZE)`);
	return roots;
};

let shared: Promise<{ db: Db; roots: PerfRoot[] }> | undefined;

// One seeded database for every perf file of a run. bun runs the files of
// one `bun test` in one process with one module cache, so the seed runs
// once. The instance lives until the process exits.
export const perfDb = () => {
	shared ??= (async () => {
		const { db } = await freshDb();
		return { db, roots: await perfSeed(db, PERF_ROWS) };
	})();
	return shared;
};
