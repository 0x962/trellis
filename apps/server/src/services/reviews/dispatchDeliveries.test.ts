import { afterAll, beforeAll, expect, test } from "bun:test";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx as CoreCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { closedBeforeDelivery } from "../deliveries/sentences.ts";
import type { IoCtx } from "../support.ts";
import { answer } from "../tickets/answer.ts";
import { create } from "../tickets/create.ts";
import { dispatchDeliveries } from "./dispatchDeliveries.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let core: CoreCtx;
const rootId = ulid();
const at = "2026-09-20T10:00:00Z";
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

// What the fake `send` recorded. Each entry is one message that left for one
// agent run.
const sent: Record<string, unknown>[] = [];
const send = (async (_ctx: unknown, input: Record<string, unknown>) => {
	sent.push(input);
	return { id: input.id };
}) as never;
const preset = (async () => "claude") as never;

const ctx = () => ({ home: "/tmp/trellis-dispatch", newTx: run }) as unknown as IoCtx;

const running = (terminalId: string) =>
	[{ id: terminalId, status: "running", controllable: true }] as unknown as RuntimeProcessStatus[];

const startRun = (id: string, ticketId: string, identifier: string) =>
	db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_path, ticket_id, ticket_identifier, terminal_id, created_at, updated_at)
		VALUES (${id}, 'crisp-fjord', 'agent', 'Build it', '/tmp/work', ${ticketId}, ${identifier},
			${`term-${id}`}, ${at}, ${at})`);

// A question with one waiting ticket, one running agent on that ticket, and
// the answer already written. The returned ids name the queued delivery.
const queueAnswer = async (title: string) => {
	const question = await run((tx) => create(core, tx, { project: "DSP", title }));
	const waiting = await run((tx) =>
		create(core, tx, { project: "DSP", title: `${title}, the work`, after: [question.identifier] }),
	);
	const runId = ulid();
	await startRun(runId, waiting.id, waiting.identifier);
	const result = await run((tx) =>
		answer(core, tx, { ticket: question.identifier, option: 1, reason: "The narrow window." }),
	);
	return { question: question.identifier, waiting: waiting.identifier, runId, commentId: result.commentId };
};

const deliveryOf = async (runId: string) => {
	const found = await db.execute(sql`SELECT state, error FROM review_deliveries WHERE run_id = ${runId}`);
	return found.rows[0];
};

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at)
		VALUES (${rootId}, ${rootId}, 'DSP', 'dsp', 'Dispatch', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${ulid()}, ${rootId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at}),
			(${ulid()}, ${rootId}, 'Done', 'done', 'done', 'fg-muted', 1, false, ${at}, ${at})`);
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

afterAll(async () => db.$client.close());

test("a queued answer reaches the terminal of a running agent", async () => {
	const queued = await queueAnswer("Run it late or leave it missed");

	await dispatchDeliveries(ctx(), running(`term-${queued.runId}`), send, preset);

	expect(sent).toEqual([
		{
			id: queued.runId,
			text: `trellis: ${queued.question} has an answer. Read: trellis thread show ${queued.commentId}\nContinue the work on ${queued.waiting}.`,
			interrupt: true,
			messageId: expect.stringMatching(/^review-[0-9A-Z]{26}-0$/),
			expectedTerminalId: `term-${queued.runId}`,
			expectedSessionId: null,
		},
	]);
	expect(await deliveryOf(queued.runId)).toEqual({ state: "sent", error: null });
});

test("a queued answer whose agent stopped fails with the closed session sentence", async () => {
	sent.length = 0;
	const queued = await queueAnswer("Which grace window");
	await db.execute(sql`UPDATE agent_runs SET closed_at = ${at} WHERE id = ${queued.runId}`);

	await dispatchDeliveries(ctx(), running(`term-${queued.runId}`), send, preset);

	expect(sent).toEqual([]);
	expect(await deliveryOf(queued.runId)).toEqual({ state: "failed", error: closedBeforeDelivery });
});
