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
		VALUES (${ulid()},${projectId},'Todo','todo','todo','fg-muted',0,true,${at},${at}),
		(${ulid()},${projectId},'Done','done','done','fg-muted',1,false,${at},${at}),
		(${ulid()},${projectId},'Canceled','canceled','canceled','fg-muted',2,false,${at},${at})`);
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

async function setup(status = "todo", state = "open") {
	const f = fixture();
	f.records.clear();
	const flow = await run((tx) => createFlow(ctx, tx, { name: `Start ${ulid()}`, project: "START" }));
	const ticket = await run((tx) => createTicket(ctx, tx, { project: "START", title: "Start fixture", status }));
	const diff = await run((tx) => ensurePr(tx, `example/start#${ticket.number}`));
	await db.execute(sql`UPDATE pull_requests SET head_sha=${"a".repeat(40)},state=${state} WHERE id=${diff.id}`);
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

test("a Done ticket accepts its explicit or sole merged diff", async () => {
	for (const explicit of [true, false]) {
		const f = await setup("done", "merged");
		const { diffId, ...implicit } = f.input;
		const result = await f.start(explicit ? f.input : implicit);
		expect(result.disposition).toBe("queued");
		expect(result.execution).toMatchObject({ ticketId: f.ticket.id, diffId, reviewedHead: f.input.headSha });
		expect(f.ticket.completedAt).not.toBeNull();
	}
});

for (const [status, state] of [
	["done", "open"],
	["done", "closed"],
	["canceled", "merged"],
]) {
	test(`${status} rejects a new reservation for a ${state} diff`, async () => {
		const f = await setup(status, state);
		await expect(f.start()).rejects.toThrow("Reopen the ticket");
		expect(f.records.size).toBe(0);
	});
}

test("a Done ticket rejects missing, unlinked and absent diffs", async () => {
	const f = await setup("done", "merged");
	await expect(f.start({ ...f.input, diffId: ulid() })).rejects.toThrow("must link");
	await db.execute(sql`DELETE FROM ticket_pull_requests WHERE ticket_id=${f.ticket.id}`);
	await expect(f.start()).rejects.toThrow("must link");
	const { diffId: _diffId, headSha: _headSha, ...withoutDiff } = f.input;
	await expect(f.start(withoutDiff)).rejects.toThrow("Reopen the ticket");
	expect(f.records.size).toBe(0);
});

test("a Done ticket requires a selected merged diff when it has several links", async () => {
	const f = await setup("done", "merged");
	const other = await setup("done", "open");
	await db.execute(sql`INSERT INTO ticket_pull_requests
		(ticket_id,pull_request_id,source,actor_name,actor_kind,created_at)
		VALUES (${f.ticket.id},${other.diff.id},'manual','test','human',${at})`);
	const { diffId: _diffId, ...ambiguous } = f.input;
	await expect(f.start(ambiguous)).rejects.toThrow("Reopen the ticket");
	await expect(f.start({ ...f.input, diffId: other.diff.id })).rejects.toThrow("Reopen the ticket");
	expect((await f.start()).execution).toMatchObject({ diffId: f.diff.id });
});

test("a merged review retains reuse, retry, repeat and exact replay", async () => {
	const f = await setup("done", "merged");
	const first = await f.start();
	for (const status of ["succeeded", "waiting", "canceled", "failed"] as const) {
		f.outcomes.set(first.execution.executionId, { status, failureKind: status === "failed" ? "feedback" : null });
		expect((await f.start({ ...f.input, requestId: crypto.randomUUID() })).execution.executionId).toBe(
			first.execution.executionId,
		);
	}
	f.outcomes.set(first.execution.executionId, { status: "failed", failureKind: "error" });
	const retry = await f.start({ ...f.input, requestId: crypto.randomUUID() });
	expect(retry.execution).toMatchObject({ repeatOf: first.execution.executionId });
	const request = { ...f.input, requestId: crypto.randomUUID(), allowRepeat: true, repeatReason: "User request" };
	const repeated = await f.start(request);
	expect(repeated.execution).toMatchObject({ repeatOf: retry.execution.executionId, repeatReason: "User request" });
	await db.execute(sql`UPDATE tickets SET status_id=(
		SELECT id FROM statuses WHERE project_id=${projectId} AND category='canceled'
	) WHERE id=${f.ticket.id}`);
	await db.execute(sql`DELETE FROM ticket_pull_requests WHERE ticket_id=${f.ticket.id}`);
	expect((await f.start(request)).execution.executionId).toBe(repeated.execution.executionId);
	await expect(f.start({ ...request, repeatReason: "Changed request" })).rejects.toThrow("different flow start");
});

test("a merged review preserves head, repeat and project validation", async () => {
	const f = await setup("done", "merged");
	await expect(f.start({ ...f.input, headSha: "b".repeat(40) })).rejects.toThrow("current head");
	await expect(f.start({ ...f.input, allowRepeat: true })).rejects.toThrow("reason");
	await expect(f.start({ ...f.input, repeatReason: "Not authorized" })).rejects.toThrow("allowRepeat");
	await expect(
		run(async (tx) => {
			await tx.execute(sql`UPDATE projects SET archived_at=${at} WHERE id=${projectId}`);
			const archived = { ...ctx, cache: createCache() };
			await archived.cache.rebuild(tx);
			return reserve(archived, tx, f.input, f.deps);
		}),
	).rejects.toThrow("archived");
	const other = ulid();
	await db.execute(sql`INSERT INTO projects (id,key,slug,name,created_at,updated_at)
		VALUES (${other},'OTHER','other','Other',${at},${at})`);
	await db.execute(sql`UPDATE flows SET project_id=${other} WHERE id=${f.flow.id}`);
	await expect(f.start()).rejects.toThrow("another project");
	expect(f.records.size).toBe(0);
});
