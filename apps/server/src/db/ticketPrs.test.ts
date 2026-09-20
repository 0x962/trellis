import { afterAll, beforeAll, expect, test } from "bun:test";
import { type ChangedFile, TicketSummarySchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { type Db, openDb } from "./client.ts";
import { migrate } from "./migrate.ts";
import { ticketSummary } from "./queries/ticketGet.ts";

let db: Db;
const root = ulid();
const status = ulid();
const ticket = ulid();
const emptyTicket = ulid();
const at = new Date("2026-09-20T10:00:00.000Z");
const repoWithTrellisPathRules = "trellis";

const check = (name: string, workflow: string | null, bucket: string) => ({ name, workflow, bucket, link: null });

const insertPull = async ({
	number,
	additions,
	deletions,
	checks,
	files,
	changedFiles = files?.length ?? null,
}: {
	number: number;
	additions: number | null;
	deletions: number | null;
	checks: ReturnType<typeof check>[];
	files: ChangedFile[] | null;
	changedFiles?: number | null;
}) => {
	const id = ulid();
	await db.execute(sql`INSERT INTO pull_requests (
		id, owner, repo, number, additions, deletions, changed_files, files, url, state, is_draft,
		head_ref, base_ref, review_state, checks, ci_state, created_at, updated_at
	) VALUES (
		${id}, 'acme', ${repoWithTrellisPathRules}, ${number}, ${additions}, ${deletions}, ${changedFiles},
		${files === null ? null : JSON.stringify(files)}::jsonb,
		${`https://github.com/acme/${repoWithTrellisPathRules}/pull/${number}`}, 'open', ${number === 2},
		${`feature-${number}`}, 'main', 'review_required', ${JSON.stringify(checks)}::jsonb,
		'fail', ${at}, ${at}
	)`);
	await db.execute(sql`INSERT INTO ticket_pull_requests (
		ticket_id, pull_request_id, source, actor_name, actor_kind, created_at
	) VALUES (${ticket}, ${id}, 'manual', 'Test', 'human', ${new Date(at.getTime() + number)})`);
	return id;
};

beforeAll(async () => {
	db = await openDb(":memory:");
	await migrate(db);
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES ('Test', 'human', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at)
		VALUES (${root}, ${root}, 'TST', 'tst', 'Test', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses (
		id, project_id, name, slug, category, color, position, is_default, created_at, updated_at
	) VALUES (${status}, ${root}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets (
		id, project_id, root_id, number, title, status_id, position, created_at, updated_at
	) VALUES
		(${ticket}, ${root}, ${root}, 1, 'Task', ${status}, 0, ${at}, ${at}),
		(${emptyTicket}, ${root}, ${root}, 2, 'Empty task', ${status}, 1, ${at}, ${at})`);

	const first = await insertPull({
		number: 1,
		additions: 99,
		deletions: 100,
		checks: [
			check("unit", "CI", "pass"),
			check("lint", "CI", "fail"),
			check("old job", null, "cancel"),
			check("deploy", "Release", "pending"),
			check("docs", "CI", "skipping"),
		],
		files: [
			{ path: "apps/web/src/routes/index.tsx", additions: 20, deletions: 2 },
			{ path: "apps/server/src/auth/session.ts", additions: 20, deletions: 2 },
			{ path: "apps/server/drizzle/0087_kind.sql", additions: 20, deletions: 2 },
			{ path: "package.json", additions: 1, deletions: 1 },
			{ path: "packages/api/src/schemas/review.ts", additions: 10, deletions: 1 },
		],
	});
	await insertPull({
		number: 2,
		additions: 200,
		deletions: 200,
		checks: [],
		files: [{ path: "apps/server/src/log.ts", additions: 5, deletions: 1 }],
	});
	await insertPull({
		number: 3,
		additions: 401,
		deletions: 0,
		checks: [],
		files: [{ path: "packages/ui/src/Button.tsx", additions: 5, deletions: 1 }],
	});
	await insertPull({ number: 4, additions: null, deletions: null, checks: [], files: null });
	await insertPull({
		number: 5,
		additions: 1,
		deletions: 1,
		checks: [],
		files: [{ path: "packages/ui/src/Dialog.tsx", additions: 1, deletions: 1 }],
		changedFiles: 2,
	});
	await db.execute(sql`INSERT INTO review_threads (id, pr_id, document, updated_at) VALUES
		(${ulid()}, ${first}, ${{ status: "open" }}, ${at}),
		(${ulid()}, ${first}, ${{ status: "resolved" }}, ${at})`);
	for (const [index, state] of ["running", "succeeded", "failed", "canceled", "waiting", "running", "failed"].entries())
		await db.execute(sql`INSERT INTO flow_executions (
			id, flow_id, ticket_id, project_id, actor_kind, actor_name, request_id,
			request, doc, state, revision, created_at, updated_at
		) VALUES (
			${ulid()}, ${ulid()}, ${ticket}, ${root}, 'human', 'Test', ${crypto.randomUUID()},
			'{}', '{}', ${{ status: state }}, 1, ${new Date(at.getTime() + index)}, ${at}
		)`);
});

afterAll(async () => {
	await db.$client.close();
});

test("a ticket summary carries one row for each pull request", async () => {
	const summary = await db.transaction((tx) => ticketSummary(tx, ticket));
	expect(TicketSummarySchema.parse(summary)).toEqual(summary);
	expect(summary.prRows.map((row) => row.sizeBand)).toEqual(["small", "medium", "large", null, "small"]);
	expect(summary.prRows[0]).toMatchObject({
		kind: "mixed",
		risk: {
			auth: "yes",
			migration: "yes",
			dependency: "yes",
			sharedType: "yes",
			deletedTest: "no",
		},
		pass: 1,
		fail: 2,
		pending: 1,
		skipped: 1,
		failedChecks: [
			{ name: "lint", workflow: "CI" },
			{ name: "old job", workflow: null },
		],
		openThreads: 1,
		flowRuns: [
			{ status: "failed" },
			{ status: "running" },
			{ status: "waiting" },
			{ status: "canceled" },
			{ status: "failed" },
		],
		flowRunCount: 7,
		baseRef: "main",
		headRef: "feature-1",
	});
	expect(summary.prRows.map((row) => row.kind)).toEqual(["mixed", "backend", "frontend", "unknown", "unknown"]);
	expect(summary.prRows[3]?.risk).toEqual({
		auth: "no",
		migration: "no",
		dependency: "no",
		sharedType: "no",
		deletedTest: "no",
	});
	expect(summary.prRows[0]).not.toHaveProperty("paths");
	expect(summary.prRows.every((row) => row.flowRuns.length === 5 && row.flowRunCount === 7)).toBe(true);

	const emptySummary = await db.transaction((tx) => ticketSummary(tx, emptyTicket));
	expect(TicketSummarySchema.parse(emptySummary)).toEqual(emptySummary);
	expect(emptySummary.prRows).toEqual([]);
});
