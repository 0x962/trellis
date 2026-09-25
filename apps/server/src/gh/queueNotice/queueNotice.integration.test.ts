import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import type { Check, Mergeable, PrState } from "@trellis/api";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { dispatchDeliveries } from "../../services/reviews/dispatchDeliveries.ts";
import type { IoCtx } from "../../services/support.ts";
import { create } from "../../services/tickets/create.ts";
import type { PullRequestRow } from "../graphql.ts";
import { deriveCiState } from "../parse.ts";
import { noticePullRequests } from "../pollerNotices.ts";
import { upsertPullRequests } from "../pollerWrite.ts";
import type { GhRunner } from "../run.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let core: ServiceCtx;
const rootId = ulid();
const t0 = new Date("2026-09-21T10:00:00Z");
const later = (ms: number) => new Date(t0.getTime() + ms);
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

// The gh stub answers every annotations read with one failure line, and
// records the arguments of each call.
const ghCalls: string[][] = [];
const gh = Object.assign(
	async (_slot: string, args: string[]) => {
		ghCalls.push(args);
		const annotations = [
			{ annotation_level: "failure", path: "src/a.test.ts", start_line: 12, message: "expected 1, received 2" },
			{ annotation_level: "warning", path: ".github", start_line: null, message: "Node 20 is deprecated" },
		];
		return { ok: true, code: 0, stdout: JSON.stringify(annotations), stderr: "" };
	},
	{ bin: "gh", timeoutMs: 1000 },
) as unknown as GhRunner;

const sent: Record<string, unknown>[] = [];
const send = (async (_ctx: unknown, input: Record<string, unknown>) => {
	sent.push(input);
	return { id: input.id };
}) as never;
const preset = (async () => "claude") as never;
// Every log line the poller and the dispatcher wrote in one test. The
// database keeps the rows of the earlier tests, and a tick of the
// dispatcher reports those rows too, so a test reads the lines of its own
// pull request.
const logged: { message: string; fields: Record<string, unknown> }[] = [];
const log = (message: string, fields: Record<string, unknown> = {}) => logged.push({ message, fields });
const linesOf = (number: number) => logged.filter((line) => line.fields.pr === `https://github.com/o/r/pull/${number}`);
const ioCtx = () => ({ home: "/tmp/trellis-check-notices", newTx: run, emit: () => {}, log }) as unknown as IoCtx;
const running = (terminalId: string) =>
	[{ id: terminalId, status: "running", controllable: true }] as unknown as RuntimeProcessStatus[];

let prNumber = 700;

const row = (
	number: number,
	headSha: string,
	checks: Check[],
	state: PrState = "open",
	mergeable: Mergeable = "unknown",
): PullRequestRow => ({
	owner: "o",
	repo: "r",
	number,
	additions: 1,
	deletions: 1,
	changedFiles: 1,
	files: [],
	url: `https://github.com/o/r/pull/${number}`,
	title: "Fix the sort",
	state,
	isDraft: false,
	isQueued: false,
	queuePosition: null,
	headSha,
	headRef: "fix",
	baseRef: "main",
	mergeable,
	reviewState: "none",
	mergedAt: null,
	closedAt: null,
	checks,
	ciState: deriveCiState(checks),
	contentHash: ulid(),
});

const write = (at: Date, pr: PullRequestRow) => run((tx) => upsertPullRequests(tx, at, [pr]));

// One ticket, one running agent on it, and one pull request linked to the
// ticket. `withTicket: false` leaves the pull request without a ticket.
const seed = async (checks: Check[], options: { withTicket?: boolean } = {}) => {
	const number = prNumber++;
	await write(t0, row(number, "aaa1111aaaa", checks));
	const [pr] = (await db.execute(sql`SELECT id FROM pull_requests WHERE number = ${number}`)).rows as { id: string }[];
	const runId = ulid();
	if (options.withTicket !== false) {
		const ticket = await run((tx) => create(core, tx, { project: "CHK", title: `Fix ${number}` }));
		await db.execute(sql`INSERT INTO agent_runs
			(id, name, kind, instruction, project_key, ticket_id, ticket_identifier, terminal_id, created_at, updated_at)
			VALUES (${runId}, 'crisp-fjord', 'agent', 'Build it', '/tmp/work', ${ticket.id}, ${ticket.identifier},
				${`term-${runId}`}, ${t0}, ${t0})`);
		await db.execute(sql`INSERT INTO ticket_pull_requests (ticket_id, pull_request_id, source, actor_name, actor_kind, created_at)
			VALUES (${ticket.id}, ${pr!.id}, 'manual', 'dana', 'human', ${t0})`);
		return { number, prId: pr!.id, ticketId: ticket.id, runId, terminal: `term-${runId}` };
	}
	return { number, prId: pr!.id, ticketId: null, runId, terminal: `term-${runId}` };
};

const queueNotices = async (prId: string) =>
	(
		await db.execute(
			sql`SELECT kind, queue_position AS "queuePosition" FROM check_notices
			WHERE pr_id = ${prId} AND kind IN ('queued', 'dequeued', 'merged') ORDER BY created_at, id`,
		)
	).rows;

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${rootId}, 'CHK', 'chk', 'Checks', ${t0}, ${t0})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${ulid()}, ${rootId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${t0}, ${t0})`);
	const cache = createCache();
	await run((tx) => cache.rebuild(tx));
	core = {
		actor: { kind: "human", name: "dana" },
		session: null,
		reqId: ulid(),
		now: t0,
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4597",
	};
}, 30_000);

afterAll(async () => db.$client.close());

beforeEach(() => {
	ghCalls.length = 0;
	sent.length = 0;
	logged.length = 0;
});

test("a queue entry includes its known position and repeated polls send it once", async () => {
	const pr = await seed([]);
	const queued = { ...row(pr.number, "aaa1111aaaa", []), isQueued: true, queuePosition: 4 };
	await write(later(1000), queued);

	await noticePullRequests(db, gh, later(1000), log);
	await noticePullRequests(db, gh, later(2000));
	await dispatchDeliveries(ioCtx(), running(pr.terminal), send, preset);
	await noticePullRequests(db, gh, later(3000));
	await dispatchDeliveries(ioCtx(), running(pr.terminal), send, preset);

	expect(sent.map((entry) => entry.text)).toEqual([
		`trellis: your pull request entered the merge queue at position 4: https://github.com/o/r/pull/${pr.number}.`,
	]);
	expect(await queueNotices(pr.prId)).toEqual([{ kind: "queued", queuePosition: 4 }]);
	expect(linesOf(pr.number)[0]!.fields).toMatchObject({
		kind: "queued",
		isQueued: true,
		queuePosition: 4,
	});
});

test("a queue removal sends one message after its queue entry", async () => {
	const pr = await seed([]);
	await write(later(1000), { ...row(pr.number, "aaa1111aaaa", []), isQueued: true, queuePosition: 2 });
	await noticePullRequests(db, gh, later(1000));
	await dispatchDeliveries(ioCtx(), running(pr.terminal), send, preset);

	await write(later(2000), row(pr.number, "aaa1111aaaa", []));
	await noticePullRequests(db, gh, later(2000));
	await noticePullRequests(db, gh, later(3000));
	await dispatchDeliveries(ioCtx(), running(pr.terminal), send, preset);

	expect(sent.map((entry) => entry.text)).toEqual([
		expect.stringContaining("entered the merge queue at position 2"),
		`trellis: GitHub removed your pull request from the merge queue: https://github.com/o/r/pull/${pr.number}.`,
	]);
	expect(await queueNotices(pr.prId)).toEqual([
		{ kind: "queued", queuePosition: 2 },
		{ kind: "dequeued", queuePosition: null },
	]);
});

test("a pull request that merges from the queue sends its completion", async () => {
	const pr = await seed([]);
	await write(later(1000), { ...row(pr.number, "aaa1111aaaa", []), isQueued: true, queuePosition: 1 });
	await noticePullRequests(db, gh, later(1000));

	await write(later(2000), row(pr.number, "aaa1111aaaa", [], "merged"));
	await noticePullRequests(db, gh, later(2000));
	await dispatchDeliveries(ioCtx(), running(pr.terminal), send, preset);

	expect(sent.map((entry) => entry.text)).toEqual([
		expect.stringContaining("entered the merge queue at position 1"),
		`trellis: your pull request merged from the merge queue: https://github.com/o/r/pull/${pr.number}.`,
	]);
	expect(await queueNotices(pr.prId)).toEqual([
		{ kind: "queued", queuePosition: 1 },
		{ kind: "merged", queuePosition: null },
	]);
});

test("a queue entry reaches the agents of every linked ticket", async () => {
	const pr = await seed([]);
	const ticket = await run((tx) => create(core, tx, { project: "CHK", title: `Share ${pr.number}` }));
	const second = ulid();
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_key, ticket_id, ticket_identifier, terminal_id, created_at, updated_at)
		VALUES (${second}, 'brisk-pine', 'agent', 'Build it', '/tmp/work', ${ticket.id}, ${ticket.identifier},
			${`term-${second}`}, ${t0}, ${t0})`);
	await db.execute(sql`INSERT INTO ticket_pull_requests
		(ticket_id, pull_request_id, source, actor_name, actor_kind, created_at)
		VALUES (${ticket.id}, ${pr.prId}, 'manual', 'dana', 'human', ${t0})`);
	await write(later(1000), { ...row(pr.number, "aaa1111aaaa", []), isQueued: true, queuePosition: 6 });

	await noticePullRequests(db, gh, later(1000));
	await dispatchDeliveries(ioCtx(), [...running(pr.terminal), ...running(`term-${second}`)], send, preset);

	expect(sent.map((entry) => entry.id).sort()).toEqual([pr.runId, second].sort());
	expect(new Set(sent.map((entry) => entry.text))).toEqual(
		new Set([
			`trellis: your pull request entered the merge queue at position 6: https://github.com/o/r/pull/${pr.number}.`,
		]),
	);
});

test("a queue notice reaches the newest open run of the ticket, and never a closed one", async () => {
	const pr = await seed([]);
	await db.execute(sql`UPDATE agent_runs SET closed_at = ${later(500)} WHERE id = ${pr.runId}`);
	const second = ulid();
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_key, ticket_id, terminal_id, created_at, updated_at)
		VALUES (${second}, 'brisk-pine', 'agent', 'Build it', '/tmp/work', ${pr.ticketId}, ${`term-${second}`},
			${later(600)}, ${later(600)})`);
	await write(later(1000), {
		...row(pr.number, "aaa1111aaaa", []),
		isQueued: true,
		queuePosition: 7,
	});
	await noticePullRequests(db, gh, later(1000), log);

	await dispatchDeliveries(ioCtx(), [...running(pr.terminal), ...running(`term-${second}`)], send, preset);

	expect(sent.map((entry) => entry.id)).toEqual([second]);
});
