import { afterAll, beforeAll, expect, test } from "bun:test";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx as CoreCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { launchState } from "../agentRuns/launchState";
import { sendDeadline } from "../deliveries/sendDeadline.ts";
import {
	otherRuntime,
	ownAuthor,
	pullRequestEnded,
	unconfirmedDelivery,
	waitedTooLong,
	waitingForRun,
} from "../deliveries/sentences.ts";
import type { IoCtx } from "../support.ts";
import { create } from "../tickets/create.ts";
import { dispatchDeliveries, WAIT_LIMIT_HOURS } from "./dispatchDeliveries.ts";
import { recordSubmission } from "./recordSubmission.ts";
import { submit } from "./remote.ts";
import { add, reply } from "./threads.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let core: CoreCtx;
const rootId = ulid();
const at = "2026-09-20T10:00:00Z";
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

const sent: Record<string, unknown>[] = [];
const send = (async (_ctx: unknown, input: Record<string, unknown>) => {
	sent.push(input);
	return { id: input.id };
}) as never;
const preset = (async () => "claude") as never;
const throwingSend = ((..._args: unknown[]) => Promise.reject(new Error("launch.json is missing."))) as never;
const timingOutSend = ((..._args: unknown[]) => sendDeadline(new Promise(() => {}), 1)) as never;

// A sent comment emits `reviews.changed`, so the review page reads the new
// state of that comment.
const events: Record<string, unknown>[] = [];
// Every line the dispatcher writes, so a test reads why a message stopped.
const logs: { message: string; fields: Record<string, unknown> }[] = [];
const ctx = () =>
	({
		home: "/tmp/trellis-dispatch",
		newTx: run,
		emit: (event: never) => events.push(event),
		log: (message: string, fields: Record<string, unknown>) => logs.push({ message, fields }),
	}) as unknown as IoCtx;

// Each seeded pull request needs its own number, because the table holds one
// row per owner, repository and number.
let prNumber = 900;

const running = (terminalId: string) =>
	[{ id: terminalId, status: "running", controllable: true }] as unknown as RuntimeProcessStatus[];
const idle = (terminalId: string) =>
	[{ id: terminalId, status: "exited", stopReason: "idle", controllable: false }] as unknown as RuntimeProcessStatus[];

const startRun = (id: string, ticketId: string, identifier: string, name = "crisp-fjord", kind = "agent") =>
	db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_key, ticket_id, ticket_identifier, terminal_id, created_at, updated_at)
		VALUES (${id}, ${name}, ${kind}, 'Build it', '/tmp/work', ${ticketId}, ${identifier},
			${`term-${id}`}, ${at}, ${at})`);

// A pull request of one ticket, one running agent on that ticket, and a
// review that a person sent back. The returned ids name the queued delivery.
const queueReview = async (title: string, threads: number) => {
	const ticket = await run((tx) => create(core, tx, { project: "DSP", title }));
	const runId = ulid();
	await startRun(runId, ticket.id, ticket.identifier);
	const prId = ulid();
	const url = `https://github.com/o/r/pull/${prNumber++}`;
	await db.execute(sql`INSERT INTO pull_requests (id, owner, repo, number, url, state, created_at, updated_at)
		VALUES (${prId}, 'o', 'r', ${prNumber}, ${url}, 'open', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO ticket_pull_requests (ticket_id, pull_request_id, source, actor_name, actor_kind, created_at)
		VALUES (${ticket.id}, ${prId}, 'manual', 'dana', 'human', ${at})`);
	const stored = await run((tx) =>
		recordSubmission(serviceCtx, tx, {
			prId,
			verdict: "comment",
			url,
			author: "0x962",
			body: "Name the count in the header.",
			revisionId: null,
			threads: Array.from({ length: threads }, () => ({}) as never),
		}),
	);
	const [row] = (await db.execute(sql`SELECT id FROM review_deliveries WHERE ticket_id = ${ticket.id}`)).rows as {
		id: string;
	}[];
	return { runId, ticketId: ticket.id, url, deliveryId: row!.id, reviewId: stored.id, agents: stored.recipients };
};

// A pull request of one ticket, one running agent on that ticket, and the
// comments an actor wrote on the diff. The clock of the service context
// sits one minute before the run of the test, so the batch window has
// passed and the dispatcher may send every row at once. The clock stays
// inside the day that a message may wait.
const threadClock = () => new Date(Date.now() - 60_000);
const threadCtx = (actor: { kind: "human" | "agent"; name: string }) =>
	({
		actor,
		session: null,
		now: threadClock,
		emit: () => {},
	}) as never;

const queueComments = async (
	title: string,
	notes: { path: string; line: number; body: string }[],
	actor?: { kind: "human" | "agent"; name: string },
) => {
	const ticket = await run((tx) => create(core, tx, { project: "DSP", title }));
	const runId = ulid();
	await startRun(runId, ticket.id, ticket.identifier);
	const reviewer = actor ?? { kind: "human" as const, name: "dana" };
	const prId = ulid();
	const url = `https://github.com/o/r/pull/${++prNumber}`;
	await db.execute(sql`INSERT INTO pull_requests (id, owner, repo, number, url, state, created_at, updated_at)
		VALUES (${prId}, 'o', 'r', ${prNumber}, ${url}, 'open', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO ticket_pull_requests (ticket_id, pull_request_id, source, actor_name, actor_kind, created_at)
		VALUES (${ticket.id}, ${prId}, 'manual', 'dana', 'human', ${at})`);
	const threads = [];
	for (const note of notes) threads.push(await run((tx) => add(threadCtx(reviewer), tx, { pr: url, ...note })));
	const queued = (await db.execute(sql`SELECT id FROM review_deliveries WHERE ticket_id = ${ticket.id} ORDER BY id`))
		.rows as { id: string }[];
	return { runId, ticketId: ticket.id, url, threads, ids: queued.map((row) => row.id) };
};

const deliveryOf = async (ticketId: string) => {
	const found = await db.execute(sql`SELECT state, error FROM review_deliveries WHERE ticket_id = ${ticketId}`);
	return found.rows[0];
};

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${rootId}, 'DSP', 'dsp', 'Dispatch', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${ulid()}, ${rootId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at}),
			(${ulid()}, ${rootId}, 'Human Review', 'human-review', 'review', 'fg-muted', 1, false, ${at}, ${at}),
			(${ulid()}, ${rootId}, 'Done', 'done', 'done', 'fg-muted', 2, false, ${at}, ${at})`);
	const cache = createCache();
	await run((tx) => cache.rebuild(tx));
	core = {
		actor: { kind: "human", name: "dana" },
		session: null,
		reqId: ulid(),
		now: new Date("2026-09-20T10:01:00Z"),
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4597",
	};
}, 30_000);

// `recordSubmission` reads the actor and the clock of a service call, which
// the transaction context of this suite does not carry.
const submissionCtx = (actor: { kind: "human" | "agent"; name: string }) =>
	({ actor, now: () => new Date(at), emit: () => {} }) as never;
const serviceCtx = submissionCtx({ kind: "human", name: "dana" });

afterAll(async () => db.$client.close());

test("a queued review whose agent stopped waits for the next run of the ticket", async () => {
	sent.length = 0;
	const queued = await queueReview("Which grace window", 1);
	await db.execute(sql`UPDATE agent_runs SET closed_at = ${at} WHERE id = ${queued.runId}`);

	await dispatchDeliveries(ctx(), running(`term-${queued.runId}`), send, preset);

	expect(sent).toEqual([]);
	expect(await deliveryOf(queued.ticketId)).toEqual({ state: "held", error: waitingForRun });

	// The person starts a new run on the same ticket, and the verdict leaves
	// with it.
	const second = ulid();
	await startRun(second, queued.ticketId, "DSP-1");
	await dispatchDeliveries(ctx(), running(`term-${second}`), send, preset);

	expect(sent).toHaveLength(1);
	expect(await deliveryOf(queued.ticketId)).toEqual({ state: "sent", error: null });
});

test("a send that never started fails with the text of its own error", async () => {
	const queued = await queueReview("Which retry count", 1);

	await dispatchDeliveries(ctx(), running(`term-${queued.runId}`), throwingSend, preset);

	expect(await deliveryOf(queued.ticketId)).toEqual({ state: "failed", error: "launch.json is missing." });
});

test("a send that passes its deadline stays unknown", async () => {
	const queued = await queueReview("Which sweep order", 1);

	await dispatchDeliveries(ctx(), running(`term-${queued.runId}`), timingOutSend, preset);

	expect(await deliveryOf(queued.ticketId)).toEqual({ state: "unknown", error: unconfirmedDelivery });
});

test("a local comment reaches the agent of the ticket", async () => {
	sent.length = 0;
	const queued = await queueReview("Open the resources section", 3);

	await dispatchDeliveries(ctx(), running(`term-${queued.runId}`), send, preset);

	expect(queued.agents).toEqual([{ runId: queued.runId, agentName: "crisp-fjord" }]);
	expect(sent).toEqual([
		{
			id: queued.runId,
			text: `trellis: your pull request has a comment. The review has 3 comments.\nReview note: Name the count in the header.\nRead the comments: trellis review list ${queued.url}\nApply what each comment asks. Answer each comment.`,
			interrupt: true,
			messageId: `review-${queued.deliveryId}`,
			expectedTerminalId: `term-${queued.runId}`,
			expectedSessionId: null,
		},
	]);
	expect(await deliveryOf(queued.ticketId)).toEqual({ state: "sent", error: null });
});

test("each local verdict queues for the agent of the linked ticket", async () => {
	for (const [verdict, body, reviewState] of [
		["approve", "", "approved"],
		["request_changes", "Fix the count.", "changes_requested"],
		["comment", "Read the note.", "review_required"],
	] as const) {
		const ticket = await run((tx) => create(core, tx, { project: "DSP", title: `${verdict} the review` }));
		const prId = ulid();
		const url = `https://github.com/o/r/pull/${++prNumber}`;
		await db.execute(sql`INSERT INTO pull_requests (id, owner, repo, number, url, state, head_sha, created_at, updated_at)
			VALUES (${prId}, 'o', 'r', ${prNumber}, ${url}, 'open', 'reviewed-head', ${at}, ${at})`);
		await db.execute(sql`INSERT INTO ticket_pull_requests (ticket_id, pull_request_id, source, actor_name, actor_kind, created_at)
			VALUES (${ticket.id}, ${prId}, 'manual', 'dana', 'human', ${at})`);
		const runId = ulid();
		await startRun(runId, ticket.id, ticket.identifier);

		const result = await run((tx) =>
			submit(serviceCtx, tx, {
				pr: url,
				headSha: "reviewed-head",
				verdict,
				body,
				threadIds: [],
			}),
		);

		expect(result.pullRequest.reviewState).toBe(reviewState);
		expect(result.submission.recipients).toEqual([{ runId, agentName: "crisp-fjord" }]);
		expect(await deliveryOf(ticket.id)).toEqual({ state: "pending", error: null });
	}
});

test("a moved head stores the verdict on the current revision and keeps older threads", async () => {
	const ticket = await run((tx) => create(core, tx, { project: "DSP", title: "Apply feedback after a new commit" }));
	const prId = ulid();
	const number = ++prNumber;
	const url = `https://github.com/o/r/pull/${number}`;
	const oldRevisionId = ulid();
	const currentRevisionId = ulid();
	const threadId = ulid();
	const runId = ulid();
	await db.execute(sql`INSERT INTO pull_requests (id, owner, repo, number, url, state, head_sha, created_at, updated_at)
		VALUES (${prId}, 'o', 'r', ${number}, ${url}, 'open', 'current-head', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO ticket_pull_requests (ticket_id, pull_request_id, source, actor_name, actor_kind, created_at)
		VALUES (${ticket.id}, ${prId}, 'manual', 'dana', 'human', ${at})`);
	await startRun(runId, ticket.id, ticket.identifier);
	await db.execute(sql`INSERT INTO review_revisions (id, pr_id, base_sha, head_sha, document, created_at) VALUES
		(${oldRevisionId}, ${prId}, 'base-head', 'old-head', ${JSON.stringify({
			id: oldRevisionId,
			prId,
			baseSha: "base-head",
			headSha: "old-head",
			patch: "",
			meta: {},
			fetchedAt: at,
		})}::jsonb, ${at}),
		(${currentRevisionId}, ${prId}, 'base-head', 'current-head', ${JSON.stringify({
			id: currentRevisionId,
			prId,
			baseSha: "base-head",
			headSha: "current-head",
			patch: "",
			meta: {},
			fetchedAt: at,
		})}::jsonb, ${at})`);
	await db.execute(sql`INSERT INTO review_threads (id, pr_id, revision_id, document, updated_at)
		VALUES (${threadId}, ${prId}, ${oldRevisionId}, ${JSON.stringify({
			id: threadId,
			prId,
			path: "src/count.ts",
			side: "new",
			line: 4,
			startLine: 4,
			revisionId: oldRevisionId,
			body: "Keep this feedback.",
			author: "dana",
			kind: "human",
			session: null,
			status: "open",
			createdAt: at,
			updatedAt: at,
			version: 1,
			resolvedAt: null,
			resolvedBy: null,
			replies: [],
			reactions: [],
			suggestion: null,
		})}::jsonb, ${at})`);

	const result = await run((tx) =>
		submit(serviceCtx, tx, {
			pr: url,
			headSha: "old-head",
			verdict: "request_changes",
			body: "Apply the feedback to the current head.",
			threadIds: [threadId],
		}),
	);
	const [stored] = (await db.execute(sql`SELECT document FROM review_submissions WHERE id = ${result.submission.id}`))
		.rows as { document: { revisionId: string | null; threads: { id: string }[] } }[];

	expect(stored?.document.revisionId).toBe(currentRevisionId);
	expect(stored?.document.threads.map((thread) => thread.id)).toEqual([threadId]);
	expect(result.submission.recipients).toEqual([{ runId, agentName: "crisp-fjord" }]);
	expect(await deliveryOf(ticket.id)).toEqual({ state: "pending", error: null });
});

test("a review with no agent assignment reports no recipient and waits for the ticket", async () => {
	const ticket = await run((tx) => create(core, tx, { project: "DSP", title: "Report the missing run" }));
	const prId = ulid();
	await db.execute(sql`INSERT INTO pull_requests (id, owner, repo, number, url, state, created_at, updated_at)
		VALUES (${prId}, 'o', 'r', ${++prNumber}, ${`https://github.com/o/r/pull/${prNumber}`}, 'open', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO ticket_pull_requests (ticket_id, pull_request_id, source, actor_name, actor_kind, created_at)
		VALUES (${ticket.id}, ${prId}, 'manual', 'dana', 'human', ${at})`);

	const stored = await run((tx) =>
		recordSubmission(serviceCtx, tx, {
			prId,
			verdict: "comment",
			url: `https://github.com/o/r/pull/${prNumber}`,
			author: "0x962",
			body: "Start a run for this review.",
			revisionId: null,
			threads: [],
		}),
	);
	const deliveries = await db.execute(
		sql`SELECT ticket_id AS "ticketId", run_id AS "runId", state FROM review_deliveries WHERE review_id = ${stored.id}`,
	);

	expect(stored.recipients).toEqual([]);
	expect(deliveries.rows).toEqual([{ ticketId: ticket.id, runId: null, state: "pending" }]);
});

test("the comments a person writes travel to the agent in one message", async () => {
	sent.length = 0;
	events.length = 0;
	const queued = await queueComments("Name the count in the header", [
		{ path: "apps/server/src/db/tx.ts", line: 42, body: "Name the count." },
		{ path: "apps/web/src/App.tsx", line: 8, body: "Use the token." },
	]);

	await dispatchDeliveries(ctx(), running(`term-${queued.runId}`), send, preset);

	expect(queued.ids).toHaveLength(2);
	expect(sent).toEqual([
		{
			id: queued.runId,
			text: `trellis: your pull request has 2 new comments.\napps/server/src/db/tx.ts:42\nName the count.\n\napps/web/src/App.tsx:8\nUse the token.\nRead every comment: trellis review list ${queued.url}\nApply what each comment asks. Answer each comment.`,
			interrupt: true,
			messageId: `review-${queued.ids[0]}`,
			expectedTerminalId: `term-${queued.runId}`,
			expectedSessionId: null,
		},
	]);
	const states = (await db.execute(sql`SELECT state FROM review_deliveries WHERE ticket_id = ${queued.ticketId}`)).rows;
	expect(states).toEqual([{ state: "sent" }, { state: "sent" }]);
	expect(events.map((event) => event.type)).toContain("reviews.changed");
});

test("a comment batch wakes an idle assigned session once", async () => {
	sent.length = 0;
	const queued = await queueComments("Wake for the review", [
		{ path: "apps/server/src/db/tx.ts", line: 42, body: "Name the count." },
		{ path: "apps/web/src/App.tsx", line: 8, body: "Use the token." },
	]);
	const session = idle(`term-${queued.runId}`);

	await dispatchDeliveries(ctx(), session, send, preset);

	expect(sent).toHaveLength(1);
	expect(sent[0]).toMatchObject({
		id: queued.runId,
		messageId: `review-${queued.ids[0]}`,
		expectedTerminalId: `term-${queued.runId}`,
	});
	expect(sent[0]!.text).toContain("2 new comments.");
	expect(await deliveriesOf(queued.ticketId)).toEqual([
		{ state: "sent", error: null },
		{ state: "sent", error: null },
	]);

	await dispatchDeliveries(ctx(), session, send, preset);

	expect(sent).toHaveLength(1);
});

test("a comment another agent writes travels to the ticket agent", async () => {
	sent.length = 0;
	const queued = await queueComments(
		"Read the review focus",
		[{ path: "apps/server/src/db/tx.ts", line: 3, body: "The service takes tx first." }],
		{ kind: "agent", name: "flow-reviewer" },
	);

	await dispatchDeliveries(ctx(), running(`term-${queued.runId}`), send, preset);

	expect(queued.ids).toHaveLength(1);
	expect(sent).toEqual([
		{
			id: queued.runId,
			text: `trellis: your pull request has 1 new comment.\napps/server/src/db/tx.ts:3\nThe service takes tx first.\nRead every comment: trellis review list ${queued.url}\nApply what each comment asks. Answer each comment.`,
			interrupt: true,
			messageId: `review-${queued.ids[0]}`,
			expectedTerminalId: `term-${queued.runId}`,
			expectedSessionId: null,
		},
	]);
});

// One ticket and one pull request that the ticket links. Each test of the
// author rule starts the agent runs it needs.
const seedTicketPr = async (title: string) => {
	const ticket = await run((tx) => create(core, tx, { project: "DSP", title }));
	const prId = ulid();
	const url = `https://github.com/o/r/pull/${++prNumber}`;
	await db.execute(sql`INSERT INTO pull_requests (id, owner, repo, number, url, state, head_sha, created_at, updated_at)
		VALUES (${prId}, 'o', 'r', ${prNumber}, ${url}, 'open', 'seed-head', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO ticket_pull_requests (ticket_id, pull_request_id, source, actor_name, actor_kind, created_at)
		VALUES (${ticket.id}, ${prId}, 'manual', 'dana', 'human', ${at})`);
	return { ticket, prId, url };
};

const note = (url: string, body: string) => ({ pr: url, path: "apps/server/src/db/tx.ts", line: 3, body });

const deliveriesOf = async (ticketId: string) =>
	(await db.execute(sql`SELECT state, error FROM review_deliveries WHERE ticket_id = ${ticketId} ORDER BY id`)).rows;

test("a comment the ticket agent writes under the identifier of its run does not travel back", async () => {
	sent.length = 0;
	const seed = await seedTicketPr("Do not echo the run identifier");
	const runId = ulid();
	await startRun(runId, seed.ticket.id, seed.ticket.identifier);

	await run((tx) => add(threadCtx({ kind: "agent", name: runId }), tx, note(seed.url, "I already wrote this.")));
	await dispatchDeliveries(ctx(), running(`term-${runId}`), send, preset);

	expect(await deliveriesOf(seed.ticket.id)).toEqual([]);
	expect(sent).toEqual([]);
});

test("a comment the ticket agent writes under its own name does not travel back", async () => {
	sent.length = 0;
	const seed = await seedTicketPr("Do not echo the agent name");
	const runId = ulid();
	await startRun(runId, seed.ticket.id, seed.ticket.identifier);

	await run((tx) => add(threadCtx({ kind: "agent", name: "crisp-fjord" }), tx, note(seed.url, "My own note.")));
	await dispatchDeliveries(ctx(), running(`term-${runId}`), send, preset);

	expect(await deliveriesOf(seed.ticket.id)).toEqual([]);
	expect(sent).toEqual([]);
});

test("a reply the ticket agent writes does not travel back to itself", async () => {
	sent.length = 0;
	const seed = await seedTicketPr("Do not echo the reply");
	const runId = ulid();
	await startRun(runId, seed.ticket.id, seed.ticket.identifier);
	const thread = await run((tx) =>
		add(threadCtx({ kind: "human", name: "dana" }), tx, note(seed.url, "Name the count.")),
	);
	await dispatchDeliveries(ctx(), running(`term-${runId}`), send, preset);
	expect(sent).toHaveLength(1);
	sent.length = 0;

	await run((tx) =>
		reply(threadCtx({ kind: "agent", name: "crisp-fjord" }), tx, { id: thread.id, body: "The header holds it now." }),
	);
	await dispatchDeliveries(ctx(), running(`term-${runId}`), send, preset);

	expect(sent).toEqual([]);
	expect(await deliveriesOf(seed.ticket.id)).toEqual([{ state: "sent", error: null }]);
});

test("a comment of a flow node on the same ticket reaches the agent of the ticket", async () => {
	sent.length = 0;
	const seed = await seedTicketPr("Read the flow finding");
	const runId = ulid();
	const flowRunId = ulid();
	await startRun(runId, seed.ticket.id, seed.ticket.identifier);
	await startRun(flowRunId, seed.ticket.id, seed.ticket.identifier, "code-reviewer", "flow");

	await run((tx) =>
		add(threadCtx({ kind: "agent", name: flowRunId }), tx, note(seed.url, "The service takes tx first.")),
	);
	await dispatchDeliveries(ctx(), running(`term-${runId}`), send, preset);

	expect(sent).toHaveLength(1);
	expect(sent[0]!.text).toContain("The service takes tx first.");
	expect(await deliveriesOf(seed.ticket.id)).toEqual([{ state: "sent", error: null }]);
});

test("the agent of a new run reads no comment that the earlier run of its ticket wrote", async () => {
	sent.length = 0;
	logs.length = 0;
	const seed = await seedTicketPr("Do not echo after a restart");
	const first = ulid();
	await startRun(first, seed.ticket.id, seed.ticket.identifier);
	// The run of the agent closes, and the agent writes its last comment. No
	// run holds the ticket then, so the comment joins the queue.
	await db.execute(sql`UPDATE agent_runs SET closed_at = ${at} WHERE id = ${first}`);
	await run((tx) =>
		add(threadCtx({ kind: "agent", name: first }), tx, note(seed.url, "I wrote this before the stop.")),
	);
	expect(await deliveriesOf(seed.ticket.id)).toEqual([{ state: "pending", error: null }]);

	// The person starts the same agent again on the same ticket. The new run
	// is the same agent, so the comment never leaves.
	const second = ulid();
	await startRun(second, seed.ticket.id, seed.ticket.identifier);
	await dispatchDeliveries(ctx(), running(`term-${second}`), send, preset);

	expect(sent).toEqual([]);
	expect(await deliveriesOf(seed.ticket.id)).toEqual([{ state: "failed", error: ownAuthor }]);
	expect(logs.filter((line) => line.message === "delivery dropped" && line.fields.reason === ownAuthor)).toHaveLength(
		1,
	);
});

test("a comment of another agent reaches the new run of the ticket", async () => {
	sent.length = 0;
	const seed = await seedTicketPr("Read the note after a restart");
	const first = ulid();
	await startRun(first, seed.ticket.id, seed.ticket.identifier);
	await db.execute(sql`UPDATE agent_runs SET closed_at = ${at} WHERE id = ${first}`);
	await run((tx) => add(threadCtx({ kind: "agent", name: "code-reviewer" }), tx, note(seed.url, "Split the file.")));

	const second = ulid();
	await startRun(second, seed.ticket.id, seed.ticket.identifier);
	await dispatchDeliveries(ctx(), running(`term-${second}`), send, preset);

	expect(sent).toHaveLength(1);
	expect(sent[0]!.text).toContain("Split the file.");
});

test("a verdict the ticket agent submits does not travel back to itself", async () => {
	sent.length = 0;
	const seed = await seedTicketPr("Do not echo the verdict");
	const runId = ulid();
	await startRun(runId, seed.ticket.id, seed.ticket.identifier);

	const stored = await run((tx) =>
		recordSubmission(submissionCtx({ kind: "agent", name: runId }), tx, {
			prId: seed.prId,
			verdict: "comment",
			url: seed.url,
			author: runId,
			body: "I reviewed my own change.",
			revisionId: null,
			threads: [],
		}),
	);
	await dispatchDeliveries(ctx(), running(`term-${runId}`), send, preset);

	expect(stored.recipients).toEqual([]);
	expect(await deliveriesOf(seed.ticket.id)).toEqual([]);
	expect(sent).toEqual([]);
});

test("a reply of a person carries the file and the line of its thread", async () => {
	sent.length = 0;
	const queued = await queueComments("Answer the open comment", [
		{ path: "apps/server/src/db/tx.ts", line: 42, body: "Name the count." },
	]);
	await dispatchDeliveries(ctx(), running(`term-${queued.runId}`), send, preset);
	sent.length = 0;
	await run((tx) =>
		reply(threadCtx({ kind: "human", name: "dana" }), tx, { id: queued.threads[0]!.id, body: "The header holds it." }),
	);

	await dispatchDeliveries(ctx(), running(`term-${queued.runId}`), send, preset);

	expect(sent).toHaveLength(1);
	expect(sent[0]!.text).toContain("1 new comment.\napps/server/src/db/tx.ts:42\nThe header holds it.");
});

test("a newer comment holds the older one back until the person stops writing", async () => {
	sent.length = 0;
	const queued = await queueComments("Hold the first comment", [
		{ path: "a.ts", line: 1, body: "First." },
		{ path: "b.ts", line: 2, body: "Second." },
	]);
	const [first, second] = queued.ids;
	await db.execute(sql`UPDATE review_deliveries SET due_at = now() - interval '1 second' WHERE id = ${first}`);
	await db.execute(sql`UPDATE review_deliveries SET due_at = now() + interval '3 seconds' WHERE id = ${second}`);

	await dispatchDeliveries(ctx(), running(`term-${queued.runId}`), send, preset);
	expect(sent).toEqual([]);

	await db.execute(sql`UPDATE review_deliveries SET due_at = now() - interval '1 second' WHERE id = ${second}`);
	await dispatchDeliveries(ctx(), running(`term-${queued.runId}`), send, preset);

	expect(sent).toHaveLength(1);
	expect(sent[0]!.messageId).toBe(`review-${first}`);
	expect(sent[0]!.text).toContain("2 new comments.");
});

test("a person who keeps writing still reaches the agent after the limit", async () => {
	sent.length = 0;
	const queued = await queueComments("Send after the limit", [
		{ path: "a.ts", line: 1, body: "First." },
		{ path: "b.ts", line: 2, body: "Second." },
	]);
	const [first, second] = queued.ids;
	await db.execute(sql`UPDATE review_deliveries SET due_at = now() - interval '40 seconds' WHERE id = ${first}`);
	await db.execute(sql`UPDATE review_deliveries SET due_at = now() + interval '3 seconds' WHERE id = ${second}`);

	await dispatchDeliveries(ctx(), running(`term-${queued.runId}`), send, preset);

	expect(sent).toHaveLength(1);
	expect(sent[0]!.text).toContain("2 new comments.");
});

test("a verdict for a ticket whose agent runs on another runtime fails and names it", async () => {
	sent.length = 0;
	const queued = await queueReview("Name the other runtime", 1);
	await db.execute(sql`UPDATE agent_runs SET runtime = 'commands' WHERE id = ${queued.runId}`);

	await dispatchDeliveries(ctx(), running(`term-${queued.runId}`), send, preset);

	expect(sent).toEqual([]);
	expect(await deliveryOf(queued.ticketId)).toEqual({ state: "failed", error: otherRuntime("commands") });
});

test("a message of a pull request that merged is dropped", async () => {
	sent.length = 0;
	const queued = await queueReview("Drop after the merge", 1);
	await db.execute(sql`UPDATE agent_runs SET closed_at = ${at} WHERE id = ${queued.runId}`);
	await dispatchDeliveries(ctx(), [], send, preset);
	expect(await deliveryOf(queued.ticketId)).toEqual({ state: "held", error: waitingForRun });

	await db.execute(sql`UPDATE pull_requests SET state = 'merged' WHERE url = ${queued.url}`);
	await dispatchDeliveries(ctx(), [], send, preset);

	expect(await deliveryOf(queued.ticketId)).toEqual({ state: "failed", error: pullRequestEnded });
});

test("a message that waited the whole limit is dropped", async () => {
	sent.length = 0;
	const queued = await queueReview("Drop after a day", 1);
	await db.execute(sql`UPDATE agent_runs SET closed_at = ${at} WHERE id = ${queued.runId}`);
	await db.execute(
		sql`UPDATE review_deliveries SET due_at = now() - make_interval(hours => ${WAIT_LIMIT_HOURS + 1})
		WHERE ticket_id = ${queued.ticketId}`,
	);

	await dispatchDeliveries(ctx(), [], send, preset);

	expect(await deliveryOf(queued.ticketId)).toEqual({ state: "failed", error: waitedTooLong });
});

test("a message waits in the queue while Trellis starts the run of its ticket", async () => {
	sent.length = 0;
	const queued = await queueReview("Hold nothing while the run starts", 1);
	const release = launchState.start("/tmp/trellis-dispatch", `term-${queued.runId}`);

	await dispatchDeliveries(ctx(), [], send, preset);
	expect(await deliveryOf(queued.ticketId)).toEqual({ state: "pending", error: null });

	release();
	await dispatchDeliveries(ctx(), [], send, preset);
	expect(await deliveryOf(queued.ticketId)).toEqual({ state: "held", error: waitingForRun });
});
