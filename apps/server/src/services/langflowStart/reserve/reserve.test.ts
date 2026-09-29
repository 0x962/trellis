import { afterAll, beforeAll, expect, test } from "bun:test";
import type { FlowExecutionStartInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../../context.ts";
import { createCache } from "../../../db/cache.ts";
import { openTestDb } from "../../../db/testDb.ts";
import type { Tx } from "../../../db/tx.ts";
import { invalidInput } from "../../../errors.ts";
import { create as createFlow } from "../../flows/flows.ts";
import { ensurePr } from "../../reviews/queries.ts";
import { create as createTicket } from "../../tickets/create.ts";
import { fixture } from "../components/fixture/fixture.ts";
import { reserve, type StartDependencies } from "./reserve.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;
const projectId = ulid();
const at = new Date("2026-09-29T06:00:00Z");
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(
		sql`INSERT INTO projects (id,key,slug,name,created_at,updated_at) VALUES (${projectId},'START','start','Start',${at},${at})`,
	);
	await db.execute(sql`INSERT INTO statuses (id,project_id,name,slug,category,color,position,is_default,created_at,updated_at)
		VALUES (${ulid()},${projectId},'Todo','todo','todo','fg-muted',0,true,${at},${at})`);
	const cache = createCache();
	await run((tx) => cache.rebuild(tx));
	ctx = {
		actor: { kind: "human", name: "test" },
		session: null,
		reqId: ulid(),
		now: at,
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4597",
	};
}, 30_000);

afterAll(async () => db.$client.close());

async function setup() {
	const f = fixture();
	f.records.clear();
	const flow = await run((tx) => createFlow(ctx, tx, { name: `Start ${ulid()}`, project: "START" }));
	const ticket = await run((tx) => createTicket(ctx, tx, { project: "START", title: "Start fixture" }));
	const diff = await run((tx) => ensurePr(tx, `example/start#${ticket.number}`));
	await db.execute(sql`UPDATE pull_requests SET head_sha=${"a".repeat(40)} WHERE id=${diff.id}`);
	await db.execute(
		sql`INSERT INTO ticket_pull_requests (ticket_id,pull_request_id,source,actor_name,actor_kind,created_at) VALUES (${ticket.id},${diff.id},'manual','test','human',${at})`,
	);
	const input = {
		flow: flow.id,
		ticket: ticket.id,
		diffId: diff.id,
		headSha: "a".repeat(40),
		expectedVersion: flow.version,
		requestId: crypto.randomUUID(),
	};
	const deps: StartDependencies = {
		hostId: "host-1",
		store: f.store,
		requireCurrentPublication: async (_ctx, _tx, request) => {
			if (request.expectedVersion !== flow.version) throw invalidInput("flow", "stale publication");
			return {
				snapshot: { ...f.initial.snapshot, flow, revision: flow.version },
				publication: { ...f.initial.publication, flowId: flow.id, revision: flow.version },
			};
		},
	};
	const start = (request: FlowExecutionStartInput = input) => run((tx) => reserve(ctx, tx, request, deps));
	return { ...f, flow, ticket, diff, input, deps, start };
}

for (const outcome of [
	{ status: "succeeded", failureKind: null },
	{ status: "canceled", failureKind: null },
	{ status: "failed", failureKind: "feedback" },
	{ status: "failed", failureKind: "error" },
] as const) {
	test(`equal UUID replays ${outcome.status}/${outcome.failureKind} after ticket completion`, async () => {
		const f = await setup();
		const first = await f.start();
		f.outcomes.set(first.execution.executionId, outcome);
		await db.execute(sql`UPDATE tickets SET completed_at=${at} WHERE id=${f.ticket.id}`);
		expect((await f.start()).execution.executionId).toBe(first.execution.executionId);
		await expect(f.start({ ...f.input, headSha: "b".repeat(40) })).rejects.toThrow("different flow start");
	});
}

test("a new UUID reuses a run across changed flow versions and heads", async () => {
	const f = await setup();
	const first = await f.start();
	const reusedInput = { ...f.input, expectedVersion: 999, headSha: "b".repeat(40), requestId: crypto.randomUUID() };
	expect((await f.start(reusedInput)).execution.executionId).toBe(first.execution.executionId);
	f.outcomes.set(first.execution.executionId, { status: "failed", failureKind: "error" });
	const next = await f.start({ ...f.input, requestId: crypto.randomUUID() });
	expect(next.execution.executionId).not.toBe(first.execution.executionId);
	expect((await f.start(reusedInput)).execution.executionId).toBe(first.execution.executionId);
	expect(next.execution.engine === "langflow" && next.execution.repeatOf).toBe(first.execution.executionId);
});

test("only a failed execution error permits automatic repetition", async () => {
	for (const outcome of [
		{ status: "running", failureKind: null },
		{ status: "waiting", failureKind: null },
		{ status: "succeeded", failureKind: null },
		{ status: "canceled", failureKind: "error" },
		{ status: "failed", failureKind: "feedback" },
	] as const) {
		const f = await setup();
		const first = await f.start();
		f.outcomes.set(first.execution.executionId, outcome);
		expect((await f.start({ ...f.input, requestId: crypto.randomUUID() })).execution.executionId).toBe(
			first.execution.executionId,
		);
	}
});

test("explicit repetition retains a long reason and permanent replay", async () => {
	const f = await setup();
	const first = await f.start();
	const request = {
		...f.input,
		requestId: crypto.randomUUID(),
		allowRepeat: true,
		repeatReason: "Required reason. ".repeat(10000),
	};
	const repeated = await f.start(request);
	expect(repeated.execution.executionId).not.toBe(first.execution.executionId);
	expect(repeated.execution.engine === "langflow" && repeated.execution.repeatReason).toBe(request.repeatReason.trim());
	expect((await f.start(request)).execution.executionId).toBe(repeated.execution.executionId);
});

test("a new run needs the current head and publication before reservation", async () => {
	const f = await setup();
	await expect(f.start({ ...f.input, headSha: "b".repeat(40) })).rejects.toThrow("current head");
	f.deps.requireCurrentPublication = async () => {
		throw invalidInput("flow", "Publish the current saved document before a new run.");
	};
	await expect(f.start()).rejects.toThrow("Publish the current saved document");
	expect(f.records.size).toBe(0);
	expect(f.receipts.size).toBe(0);
});

test("actor, diff and repeat checks precede reservation", async () => {
	const f = await setup();
	await expect(run((tx) => reserve({ ...ctx, actor: null }, tx, f.input, f.deps))).rejects.toThrow();
	await expect(f.start({ ...f.input, diffId: ulid() })).rejects.toThrow("must link");
	await expect(f.start({ ...f.input, allowRepeat: true })).rejects.toThrow("reason");
	await expect(f.start({ ...f.input, repeatReason: "Not authorized" })).rejects.toThrow("allowRepeat");
	expect(f.records.size).toBe(0);
});
