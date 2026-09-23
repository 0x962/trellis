import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import type { Check, CheckBucket, Mergeable, PrState } from "@trellis/api";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../context.ts";
import { createCache } from "../db/cache.ts";
import { openTestDb } from "../db/testDb.ts";
import type { Tx } from "../db/tx.ts";
import { supersededCheck, waitingForRun } from "../services/deliveries/sentences.ts";
import { dispatchDeliveries } from "../services/reviews/dispatchDeliveries.ts";
import type { IoCtx } from "../services/support.ts";
import { create } from "../services/tickets/create.ts";
import { SETTLE_MS } from "./checkNotice.ts";
import type { PullRequestRow } from "./graphql.ts";
import { deriveCiState } from "./parse.ts";
import { noticeChecks } from "./pollerNotices.ts";
import { upsertPullRequests } from "./pollerWrite.ts";
import type { GhRunner } from "./run.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let core: ServiceCtx;
const projectId = ulid();
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

const check = (name: string, bucket: CheckBucket): Check => ({
	name,
	workflow: "CI",
	bucket,
	link: `https://github.com/o/r/actions/runs/5/job/${name.length}`,
	startedAt: null,
	endedAt: null,
});

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

const notices = async (prId: string) =>
	(
		await db.execute(
			sql`SELECT kind, head_sha AS "headSha", checks FROM check_notices WHERE pr_id = ${prId} ORDER BY created_at, id`,
		)
	).rows as { kind: string; headSha: string; checks: { name: string; lines: string[] }[] }[];

const deliveries = async (ticketId: string) =>
	(await db.execute(sql`SELECT state, error FROM review_deliveries WHERE ticket_id = ${ticketId} ORDER BY id`)).rows;

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${projectId}, 'CHK', 'chk', 'Checks', ${t0}, ${t0})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, reviewer, color, position, is_default, created_at, updated_at)
		VALUES (${ulid()}, ${projectId}, 'Todo', 'todo', 'todo', NULL, 'fg-muted', 0, true, ${t0}, ${t0})`);
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

test("a failure reaches the running agent once, after the burst settles, and a green head follows", async () => {
	const pr = await seed([check("lint", "fail"), check("test", "pending")]);

	await noticeChecks(db, gh, later(10_000));
	expect(await notices(pr.prId)).toEqual([]);

	await noticeChecks(db, gh, later(SETTLE_MS));
	await dispatchDeliveries(ioCtx(), running(pr.terminal), send, preset);
	expect(ghCalls).toEqual([["api", "repos/o/r/check-runs/4/annotations"]]);
	expect(sent.map((entry) => entry.text)).toEqual([
		[
			"trellis: 1 check failed on commit aaa1111 of https://github.com/o/r/pull/700.",
			"CI / lint: https://github.com/o/r/actions/runs/5/job/4",
			"  src/a.test.ts:12 expected 1, received 2",
			"Read the log, fix the cause, and push. Trellis tells you when every check passes.",
		].join("\n"),
	]);

	// The detector holds nothing in memory, so a call after a restart reads
	// the same notices and writes none.
	await noticeChecks(db, gh, later(SETTLE_MS + 10_000));
	await noticeChecks(db, gh, later(3_600_000));
	await dispatchDeliveries(ioCtx(), running(pr.terminal), send, preset);
	expect((await notices(pr.prId)).map((notice) => notice.kind)).toEqual(["failed"]);
	expect(sent).toHaveLength(1);

	await write(later(3_700_000), row(pr.number, "bbb2222bbbb", [check("lint", "pass"), check("test", "pass")]));
	await noticeChecks(db, gh, later(3_700_000));
	await noticeChecks(db, gh, later(3_710_000));
	await dispatchDeliveries(ioCtx(), running(pr.terminal), send, preset);
	expect(sent.map((entry) => entry.text)).toEqual([
		expect.any(String),
		"trellis: every check passed on commit bbb2222 of https://github.com/o/r/pull/700.",
	]);
	expect(await deliveries(pr.ticketId!)).toEqual([
		{ state: "sent", error: null },
		{ state: "sent", error: null },
	]);
});

test("a write that leaves the checks and the head alone keeps the quiet time", async () => {
	const pr = await seed([check("lint", "fail"), check("test", "pending")]);
	await write(later(50_000), row(pr.number, "aaa1111aaaa", [check("lint", "fail"), check("test", "pending")]));

	await noticeChecks(db, gh, later(SETTLE_MS));
	expect((await notices(pr.prId)).map((notice) => notice.kind)).toEqual(["failed"]);
});

test("a pull request with no ticket, or one that merged, gets no notice", async () => {
	const orphan = await seed([check("lint", "fail")], { withTicket: false });
	const merged = await seed([check("lint", "fail")]);
	await write(later(1000), row(merged.number, "aaa1111aaaa", [check("lint", "fail"), check("x", "fail")], "merged"));

	await noticeChecks(db, gh, later(SETTLE_MS));
	expect(await notices(orphan.prId)).toEqual([]);
	expect(await notices(merged.prId)).toEqual([]);
	expect(ghCalls).toEqual([]);
});

test("a notice for an agent that does not run waits, and the next run of the ticket reads it", async () => {
	const pr = await seed([check("lint", "fail")]);
	await noticeChecks(db, gh, later(SETTLE_MS));

	await dispatchDeliveries(ioCtx(), running("term-other"), send, preset);
	expect(sent).toEqual([]);
	expect(await deliveries(pr.ticketId!)).toEqual([{ state: "held", error: waitingForRun }]);

	await dispatchDeliveries(ioCtx(), running(pr.terminal), send, preset);
	expect(sent.map((entry) => entry.id)).toEqual([pr.runId]);
	expect(await deliveries(pr.ticketId!)).toEqual([{ state: "sent", error: null }]);
});

test("a notice that a new head commit replaced before the send fails with its sentence", async () => {
	const pr = await seed([check("lint", "fail")]);
	await noticeChecks(db, gh, later(SETTLE_MS));
	await write(later(SETTLE_MS + 1000), row(pr.number, "ccc3333cccc", [check("lint", "pending")]));

	await dispatchDeliveries(ioCtx(), running(pr.terminal), send, preset);
	expect(sent).toEqual([]);
	expect(await deliveries(pr.ticketId!)).toEqual([{ state: "failed", error: supersededCheck }]);
});

test("a conflict reaches the running agent once per head, after GitHub answers, and a clear follows", async () => {
	const pr = await seed([]);
	const url = `https://github.com/o/r/pull/${pr.number}`;

	await write(later(1000), row(pr.number, "aaa1111aaaa", [], "open", "conflicting"));
	await noticeChecks(db, gh, later(1000));
	await dispatchDeliveries(ioCtx(), running(pr.terminal), send, preset);
	expect(sent.map((entry) => entry.text)).toEqual([
		[
			`trellis: ${url} has a merge conflict with the base branch main on commit aaa1111.`,
			"Merge the base branch into your branch: git fetch origin && git merge origin/main",
			"Resolve each conflict, run the tests, commit, and push. Trellis tells you when the conflict is gone.",
		].join("\n"),
	]);

	// The detector holds nothing in memory, so a call after a restart reads
	// the same notices and writes none.
	await noticeChecks(db, gh, later(2000));
	await noticeChecks(db, gh, later(3000));

	// A push gives a new head, and GitHub answers unknown until it computed
	// the merge. Unknown sends nothing.
	await write(later(4000), row(pr.number, "bbb2222bbbb", [], "open", "unknown"));
	await noticeChecks(db, gh, later(4000));
	expect((await notices(pr.prId)).map((notice) => notice.kind)).toEqual(["conflict"]);

	await write(later(5000), row(pr.number, "bbb2222bbbb", [], "open", "mergeable"));
	await noticeChecks(db, gh, later(5000));
	await noticeChecks(db, gh, later(6000));
	await dispatchDeliveries(ioCtx(), running(pr.terminal), send, preset);
	expect(sent.map((entry) => entry.text)).toEqual([
		expect.any(String),
		`trellis: the merge conflict of ${url} is gone. Commit bbb2222 merges into main with no conflict.`,
	]);
	expect(await notices(pr.prId)).toEqual([
		{ kind: "conflict", headSha: "aaa1111aaaa", checks: [] },
		{ kind: "clear", headSha: "bbb2222bbbb", checks: [] },
	]);
	expect(ghCalls).toEqual([]);
});

test("a check notice and a conflict notice in one tick both reach the agent", async () => {
	const pr = await seed([check("lint", "fail")]);
	await write(t0, row(pr.number, "aaa1111aaaa", [check("lint", "fail")], "open", "conflicting"));

	await noticeChecks(db, gh, later(SETTLE_MS));
	await dispatchDeliveries(ioCtx(), running(pr.terminal), send, preset);
	expect((await notices(pr.prId)).map((notice) => notice.kind).sort()).toEqual(["conflict", "failed"]);
	expect(await deliveries(pr.ticketId!)).toEqual([
		{ state: "sent", error: null },
		{ state: "sent", error: null },
	]);
});

test("a conflict on a GitHub draft, a merged pull request, or one with no ticket sends nothing", async () => {
	const draft = await seed([]);
	await write(later(1000), { ...row(draft.number, "aaa1111aaaa", [], "open", "conflicting"), isDraft: true });
	const merged = await seed([]);
	await write(later(1000), row(merged.number, "aaa1111aaaa", [], "merged", "conflicting"));
	const orphan = await seed([], { withTicket: false });
	await write(later(1000), row(orphan.number, "aaa1111aaaa", [], "open", "conflicting"));

	await noticeChecks(db, gh, later(1000));
	expect(await notices(draft.prId)).toEqual([]);
	expect(await notices(merged.prId)).toEqual([]);
	expect(await notices(orphan.prId)).toEqual([]);
});

test("a conflict on a pull request that is not ready for review still reaches the agent", async () => {
	const pr = await seed([]);
	await db.execute(sql`UPDATE pull_requests SET local_state = 'not-ready' WHERE id = ${pr.prId}`);
	await write(later(1000), row(pr.number, "aaa1111aaaa", [], "open", "conflicting"));

	await noticeChecks(db, gh, later(1000));
	expect((await notices(pr.prId)).map((notice) => notice.kind)).toEqual(["conflict"]);
});

test("a conflict waits while the ticket runs no agent, and the next run reads it", async () => {
	const pr = await seed([]);
	await write(later(1000), row(pr.number, "aaa1111aaaa", [], "open", "conflicting"));
	await noticeChecks(db, gh, later(1000), log);

	// The agent of the ticket has no process, so the notice waits.
	await dispatchDeliveries(ioCtx(), [], send, preset);
	expect(sent).toEqual([]);
	expect(await deliveries(pr.ticketId!)).toEqual([{ state: "held", error: waitingForRun }]);

	// The person starts a run on the ticket, and the notice leaves.
	await dispatchDeliveries(ioCtx(), running(pr.terminal), send, preset);
	expect(sent.map((entry) => entry.id)).toEqual([pr.runId]);
	expect(await deliveries(pr.ticketId!)).toEqual([{ state: "sent", error: null }]);

	const lines = linesOf(pr.number);
	expect(lines.map((line) => line.message)).toEqual([
		"notice queued",
		"delivery held",
		"delivery released",
		"delivery sent",
	]);
	expect(lines[0]!.fields).toEqual({
		pr: `https://github.com/o/r/pull/${pr.number}`,
		kind: "conflict",
		head: "aaa1111aaaa",
		tickets: [pr.ticketId],
	});
	expect(lines[1]!.fields).toMatchObject({ kind: "conflict", head: "aaa1111aaaa" });
	expect(lines[3]!.fields).toMatchObject({ kind: "conflict", run: pr.runId });
});

test("a notice that waits is dropped when a new head arrives before the agent starts", async () => {
	const pr = await seed([]);
	await write(later(1000), row(pr.number, "aaa1111aaaa", [], "open", "conflicting"));
	await noticeChecks(db, gh, later(1000), log);
	await dispatchDeliveries(ioCtx(), [], send, preset);
	expect(await deliveries(pr.ticketId!)).toEqual([{ state: "held", error: waitingForRun }]);

	await write(later(2000), row(pr.number, "ddd4444dddd", [], "open", "unknown"));
	await dispatchDeliveries(ioCtx(), running(pr.terminal), send, preset);

	expect(sent).toEqual([]);
	expect(await deliveries(pr.ticketId!)).toEqual([{ state: "failed", error: supersededCheck }]);
	expect(linesOf(pr.number).map((line) => line.message)).toEqual([
		"notice queued",
		"delivery held",
		"delivery dropped",
	]);
});

test("a notice reaches the newest open run of the ticket, and never a closed one", async () => {
	const pr = await seed([]);
	await db.execute(sql`UPDATE agent_runs SET closed_at = ${later(500)} WHERE id = ${pr.runId}`);
	const second = ulid();
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_key, ticket_id, terminal_id, created_at, updated_at)
		VALUES (${second}, 'brisk-pine', 'agent', 'Build it', '/tmp/work', ${pr.ticketId}, ${`term-${second}`},
			${later(600)}, ${later(600)})`);
	await write(later(1000), row(pr.number, "aaa1111aaaa", [], "open", "conflicting"));
	await noticeChecks(db, gh, later(1000), log);

	await dispatchDeliveries(ioCtx(), [...running(pr.terminal), ...running(`term-${second}`)], send, preset);

	expect(sent.map((entry) => entry.id)).toEqual([second]);
});
