import { afterAll, beforeAll, expect, test } from "bun:test";
import { SearchOutputSchema, SearchQuerySchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../context.ts";
import { createCache } from "../db/cache.ts";
import { openTestDb } from "../db/testDb.ts";
import { query } from "./search.ts";

const at = new Date("2026-09-29T12:00:00.000Z");
const id = (n: number) => `01M${String(n).padStart(23, "0")}`;
const actor = { name: "Search tester", kind: "human" as const };
let db: Awaited<ReturnType<typeof openTestDb>>;
const ctx: ServiceCtx = {
	actor,
	session: null,
	reqId: "search-test",
	now: at,
	emit: () => {},
	cache: createCache(),
	actorCache: new Map(),
	dropBlobs: () => {},
	publicUrl: "http://trellis.test",
};

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES (${actor.name}, 'human', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, position, created_at, updated_at)
		SELECT '01M' || lpad(n::text, 23, '0'), 'PX' || n, 'project-' || n,
			'Pagination project ' || n, 0, ${at}, ${at}
		FROM generate_series(1, 53) n`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		SELECT '01M' || lpad((100 + n)::text, 23, '0'), '01M' || lpad(n::text, 23, '0'),
			'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at}
		FROM generate_series(1, 2) n`);
	await db.execute(sql`INSERT INTO tickets
		(id, project_id, number, title, status_id, position, created_at, updated_at)
		SELECT '01M' || lpad((200 + n)::text, 23, '0'),
			CASE WHEN n <= 30 THEN ${id(1)} ELSE ${id(2)} END,
			n, 'Pagination ticket PX1-1',
			CASE WHEN n <= 30 THEN ${id(101)} ELSE ${id(102)} END, n, ${at}, ${at}
		FROM generate_series(1, 57) n`);
	await db.execute(sql`INSERT INTO pages (
		id, project_id, slug, title, summary, version, latest_version,
		creator_actor_name, creator_actor_kind, actor_name, actor_kind, created_at, updated_at
	)
		SELECT '01M' || lpad((300 + n)::text, 23, '0'),
			CASE WHEN n <= 30 THEN ${id(1)} ELSE ${id(2)} END,
			'page-' || n, CASE WHEN n <= 20 THEN 'Pagination title' ELSE 'Other title' END,
			CASE WHEN n BETWEEN 21 AND 40 THEN 'Pagination summary' ELSE '' END,
			1, 1, ${actor.name}, 'human', ${actor.name}, 'human', ${at}, ${at}
		FROM generate_series(1, 51) n`);
	await db.execute(sql`INSERT INTO page_versions (
		page_id, number, request_id, document_sha256, document_size, search_text,
		search_indexed, source_path, actor_name, actor_kind, created_at
	)
		SELECT '01M' || lpad((300 + n)::text, 23, '0'), 1, 'request-' || n, ${"a".repeat(64)},
			10, 'Pagination content', true, 'index.html', ${actor.name}, 'human', ${at}
		FROM generate_series(1, 51) n`);
	await db.transaction((tx) => ctx.cache.rebuild(tx));
}, 60_000);

afterAll(async () => {
	await db.$client.close();
});

const read = (input: unknown) => db.transaction((tx) => query(ctx, tx, input));

test("returns all three result types in bounded pages without duplicate matches", async () => {
	const first = await read({ q: "pagination", limit: 50 });
	const second = await read({ q: "pagination", limit: 50, offset: first.nextOffset });
	expect(first.tickets).toHaveLength(50);
	expect(first.projects).toHaveLength(50);
	expect(first.pages).toHaveLength(50);
	expect(first.nextOffset).toBe(50);
	expect(second.tickets).toHaveLength(7);
	expect(second.projects).toHaveLength(3);
	expect(second.pages).toHaveLength(1);
	expect(second.nextOffset).toBeNull();
	for (const kind of ["tickets", "projects", "pages"] as const) {
		const ids = [...first[kind], ...second[kind]].map((row) => row.id);
		expect(new Set(ids).size).toBe(ids.length);
	}
	expect(SearchOutputSchema.safeParse(first).success).toBe(true);
	expect(SearchOutputSchema.safeParse(second).success).toBe(true);
});

test("keeps preferred projects, text rank, and equal-rank ID order across pages", async () => {
	const results = [];
	let offset: number | null = 0;
	while (offset !== null) {
		const page = await read({ q: "pagination", rankProject: "PX1", limit: 20, offset });
		results.push(page);
		offset = page.nextOffset;
	}
	const tickets = results.flatMap((page) => page.tickets);
	expect(tickets.map((ticket) => ticket.id)).toEqual([
		...Array.from({ length: 30 }, (_, n) => id(230 - n)),
		...Array.from({ length: 27 }, (_, n) => id(257 - n)),
	]);
	const pages = results.flatMap((page) => page.pages);
	expect(pages.map((page) => page.id)).toEqual([
		...Array.from({ length: 20 }, (_, n) => id(320 - n)),
		...Array.from({ length: 10 }, (_, n) => id(330 - n)),
		...Array.from({ length: 10 }, (_, n) => id(340 - n)),
		...Array.from({ length: 11 }, (_, n) => id(351 - n)),
	]);
	expect(results.flatMap((page) => page.projects).map((project) => project.slug)).toEqual(
		Array.from({ length: 53 }, (_, n) => `project-${n + 1}`).sort(),
	);
});

test("pages an exact identifier before its text matches and respects project scope", async () => {
	const first = await read({ q: "PX1-1", limit: 20, project: "PX1" });
	const second = await read({ q: "PX1-1", limit: 20, project: "PX1", offset: first.nextOffset });
	expect(first.tickets[0]?.identifier).toBe("PX1-1");
	const tickets = [...first.tickets, ...second.tickets];
	expect(tickets).toHaveLength(30);
	expect(new Set(tickets.map((ticket) => ticket.id)).size).toBe(30);
	expect(tickets.every((ticket) => ticket.project.key === "PX1")).toBe(true);
	expect(second.nextOffset).toBeNull();
	expect(first.projects).toEqual([]);
	const scoped = await read({ q: "pagination", project: "PX2", limit: 50 });
	expect(scoped.tickets).toHaveLength(27);
	expect(scoped.pages).toHaveLength(21);
	expect(scoped.projects.map((project) => project.key)).toEqual(["PX2"]);
	expect(scoped.nextOffset).toBeNull();
});

test("returns a terminal empty page and rejects invalid pagination inputs", async () => {
	expect(await read({ q: "unmatched", limit: 50 })).toEqual({
		tickets: [],
		projects: [],
		pages: [],
		nextOffset: null,
	});
	expect((await read({ q: "pagination", offset: 100 })).nextOffset).toBeNull();
	for (const input of [{ limit: 51 }, { limit: 0 }, { offset: -1 }, { offset: 0.5 }]) {
		expect(SearchQuerySchema.safeParse({ q: "pagination", ...input }).success).toBe(false);
	}
});
