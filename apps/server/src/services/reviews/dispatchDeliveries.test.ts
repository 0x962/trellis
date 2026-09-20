import { afterAll, beforeAll, expect, test } from "bun:test";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx as CoreCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { sendDeadline } from "../deliveries/sendDeadline.ts";
import { closedBeforeDelivery, unconfirmedDelivery } from "../deliveries/sentences.ts";
import type { IoCtx } from "../support.ts";
import { answer } from "../tickets/answer.ts";
import { create } from "../tickets/create.ts";
import { dispatchAnswerDeliveries } from "./dispatchDeliveries.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let core: CoreCtx;
const rootId = ulid();
const at = "2026-09-20T10:00:00Z";
const question = "Options:\n1. Leave it missed.\n2. Run it late.\n";
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

const sent: Record<string, unknown>[] = [];
const send = (async (_ctx: unknown, input: Record<string, unknown>) => {
	sent.push(input);
	return { id: input.id };
}) as never;
const preset = (async () => "claude") as never;
const throwingSend = ((..._args: unknown[]) => Promise.reject(new Error("launch.json is missing."))) as never;
const timingOutSend = ((..._args: unknown[]) => sendDeadline(new Promise(() => {}), 1)) as never;

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
	const asked = await run((tx) =>
		create(core, tx, { project: "DSP", title, description: question, status: "human-review" }),
	);
	const waiting = await run((tx) =>
		create(core, tx, { project: "DSP", title: `${title}, the work`, after: [asked.identifier] }),
	);
	const runId = ulid();
	await startRun(runId, waiting.id, waiting.identifier);
	const result = await run((tx) =>
		answer(core, tx, { ticket: asked.identifier, option: 1, reason: "The narrow window." }),
	);
	const [row] = (await db.execute(sql`SELECT id FROM review_deliveries WHERE run_id = ${runId}`)).rows as {
		id: string;
	}[];
	return {
		question: asked.identifier,
		waiting: waiting.identifier,
		runId,
		commentId: result.commentId,
		deliveryId: row!.id,
	};
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
		(id, project_id, name, slug, category, reviewer, color, position, is_default, created_at, updated_at)
		VALUES (${ulid()}, ${rootId}, 'Todo', 'todo', 'todo', NULL, 'fg-muted', 0, true, ${at}, ${at}),
			(${ulid()}, ${rootId}, 'Human Review', 'human-review', 'review', 'human', 'fg-muted', 1, false, ${at}, ${at}),
			(${ulid()}, ${rootId}, 'Done', 'done', 'done', NULL, 'fg-muted', 2, false, ${at}, ${at})`);
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
	sent.length = 0;
	const queued = await queueAnswer("Run it late or leave it missed");

	await dispatchAnswerDeliveries(ctx(), running(`term-${queued.runId}`), send, preset);

	expect(sent).toEqual([
		{
			id: queued.runId,
			text: `trellis: ${queued.question} has an answer. Read: trellis thread show ${queued.commentId}\nContinue the work on ${queued.waiting}.`,
			interrupt: true,
			messageId: `review-${queued.deliveryId}`,
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

	await dispatchAnswerDeliveries(ctx(), running(`term-${queued.runId}`), send, preset);

	expect(sent).toEqual([]);
	expect(await deliveryOf(queued.runId)).toEqual({ state: "failed", error: closedBeforeDelivery });
});

test("a send that never started fails with the text of its own error", async () => {
	const queued = await queueAnswer("Which retry count");

	await dispatchAnswerDeliveries(ctx(), running(`term-${queued.runId}`), throwingSend, preset);

	expect(await deliveryOf(queued.runId)).toEqual({ state: "failed", error: "launch.json is missing." });
});

test("a send that passes its deadline stays unknown", async () => {
	const queued = await queueAnswer("Which sweep order");

	await dispatchAnswerDeliveries(ctx(), running(`term-${queued.runId}`), timingOutSend, preset);

	expect(await deliveryOf(queued.runId)).toEqual({ state: "unknown", error: unconfirmedDelivery });
});
