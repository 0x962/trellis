import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { ticketGet } from "../../db/queries/ticketGet.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { answer } from "./answer.ts";
import { create } from "./create.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;
const rootId = ulid();
const at = "2026-09-20T10:00:00Z";
const question = "The run can miss its window.\n\nOptions:\n\n1. Leave it missed.\n2. Run it late.\n";
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

const ask = (title: string) =>
	run((tx) => create(ctx, tx, { project: "ANS", title, description: question, status: "human-review" }));

// A run with a `closedAt` instant is an agent that already stopped, and the
// answer skips it.
const startRun = (id: string, ticketId: string, name: string, closedAt: string | null) =>
	db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_path, ticket_id, terminal_id, closed_at, created_at, updated_at)
		VALUES (${id}, ${name}, 'agent', 'Build it', '/tmp/work', ${ticketId}, ${`term-${id}`}, ${closedAt}, ${at}, ${at})`);

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at)
		VALUES (${rootId}, ${rootId}, 'ANS', 'ans', 'Answer', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, reviewer, color, position, is_default, created_at, updated_at)
		VALUES (${ulid()}, ${rootId}, 'Todo', 'todo', 'todo', NULL, 'fg-muted', 0, true, ${at}, ${at}),
			(${ulid()}, ${rootId}, 'Human Review', 'human-review', 'review', 'human', 'fg-muted', 1, false, ${at}, ${at}),
			(${ulid()}, ${rootId}, 'Done', 'done', 'done', NULL, 'fg-muted', 2, false, ${at}, ${at})`);
	const cache = createCache();
	await run((tx) => cache.rebuild(tx));
	ctx = {
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

afterAll(async () => db.$client.close());

test("an answer writes the answer row, closes the question, and queues the running agents", async () => {
	const asked = await ask("Run it late or leave it missed");
	const waiting = await run((tx) =>
		create(ctx, tx, { project: "ANS", title: "The sweep pass survives one failure", after: [asked.identifier] }),
	);
	const quiet = await run((tx) =>
		create(ctx, tx, { project: "ANS", title: "The run settles on the page", after: [asked.identifier] }),
	);
	const liveRunId = ulid();
	await startRun(liveRunId, waiting.id, "crisp-fjord", null);
	await startRun(ulid(), quiet.id, "wry-heron", at);

	const result = await run((tx) =>
		answer(ctx, tx, {
			ticket: asked.identifier,
			option: 2,
			reason: "A late run reads the day it was written for.",
			expectedVersion: asked.version,
		}),
	);

	expect(result.ticket.status.category).toBe("done");
	expect(result.deliveries).toEqual([{ ticket: waiting.identifier, runId: liveRunId, agentName: "crisp-fjord" }]);
	expect(result.ticket.answer).toEqual({
		option: 2,
		reason: "A late run reads the day it was written for.",
		actor: { name: "dana", kind: "human" },
		createdAt: "2026-09-20T10:01:00.000Z",
	});
	const answers = await db.execute(
		sql`SELECT ticket_id, option, reason, actor_name FROM ticket_answers WHERE id = ${result.answerId}`,
	);
	expect(answers.rows).toEqual([
		{ ticket_id: asked.id, option: 2, reason: "A late run reads the day it was written for.", actor_name: "dana" },
	]);
	const comments = await db.execute(sql`SELECT count(*)::int AS n FROM comments`);
	expect(comments.rows).toEqual([{ n: 0 }]);
	const deliveries = await db.execute(
		sql`SELECT answer_id, run_id, review_id, state FROM review_deliveries ORDER BY id`,
	);
	expect(deliveries.rows).toEqual([
		{ answer_id: result.answerId, run_id: liveRunId, review_id: null, state: "pending" },
	]);
	const waitingTicket = await run((tx) => ticketGet(tx, waiting.id));
	expect(waitingTicket.answeredQuestions).toEqual([
		{ identifier: asked.identifier, title: "Run it late or leave it missed", option: 2 },
	]);
});

test("the delivery table refuses a second row for the same answer and the same run", async () => {
	const [queued] = (await db.execute(sql`SELECT answer_id, run_id FROM review_deliveries ORDER BY id LIMIT 1`))
		.rows as { answer_id: string; run_id: string }[];
	await expect(
		db.execute(sql`INSERT INTO review_deliveries (id, answer_id, run_id)
			VALUES (${ulid()}, ${queued!.answer_id}, ${queued!.run_id})`),
	).rejects.toThrow("review_deliveries_recipient");
});

test("a ticket that asks no question refuses the answer", async () => {
	const plain = await run((tx) => create(ctx, tx, { project: "ANS", title: "Build the sweep pass" }));
	await expect(
		run((tx) => answer(ctx, tx, { ticket: plain.identifier, option: 1, reason: "The narrow one." })),
	).rejects.toThrow("This ticket asks no question.");
	const unchanged = await db.execute(sql`SELECT version FROM tickets WHERE id = ${plain.id}`);
	expect(unchanged.rows).toEqual([{ version: plain.version }]);
});

test("an option number the list does not hold refuses the answer", async () => {
	const asked = await ask("Which grace window");
	await expect(
		run((tx) => answer(ctx, tx, { ticket: asked.identifier, option: 7, reason: "The wide one." })),
	).rejects.toThrow("This question lists options 1, 2. Pick one of them.");
});

test("a second answer on the same question refuses the stale version", async () => {
	const asked = await ask("Which retry count");
	await run((tx) => answer(ctx, tx, { ticket: asked.identifier, option: 1, reason: "The narrow one." }));
	await expect(
		run((tx) =>
			answer(ctx, tx, {
				ticket: asked.identifier,
				option: 2,
				reason: "The wide one.",
				expectedVersion: asked.version,
			}),
		),
	).rejects.toThrow();
});
