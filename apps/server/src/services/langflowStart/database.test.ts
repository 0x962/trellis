import { afterEach, expect, test } from "bun:test";
import { executionViewV1Example } from "@trellis/api";
import { eq, sql } from "drizzle-orm";
import { initializeProjection } from "../../db/queries/langflowExecution";
import { langflowExecutions, langflowOutbox } from "../../db/tables/langflowExecution";
import { start as legacyStart } from "../flowExecutions/start.ts";
import { databaseFixture } from "./database.fixture.ts";
import { databaseStore } from "./databaseStore";
import { fixture } from "./fixture.ts";
import { reconcile } from "./reconcile.ts";
import { reserve } from "./reserve.ts";

const opened: Awaited<ReturnType<typeof databaseFixture>>[] = [];
afterEach(async () => {
	for (const f of opened.splice(0)) await f.db.$client.close();
});
async function setup() {
	const f = await databaseFixture();
	opened.push(f);
	return f;
}

for (const outcome of [
	{ status: "succeeded", failureKind: null },
	{ status: "canceled", failureKind: null },
	{ status: "failed", failureKind: "feedback" },
	{ status: "failed", failureKind: "error" },
] as const)
	test(`database replay survives ${outcome.status}/${outcome.failureKind}`, async () => {
		const f = await setup();
		const first = await f.start();
		if (first.execution.engine !== "langflow") throw new Error("fixture_engine");
		const execution = first.execution;
		await f.run((tx) =>
			initializeProjection(tx, {
				view: {
					...executionViewV1Example,
					id: execution.executionId,
					snapshot: execution.snapshot,
					publication: execution.publication,
					...outcome,
				},
			}),
		);
		const request = { ...f.input, requestId: crypto.randomUUID() };
		const next = await f.start(request);
		expect(next.execution.executionId === execution.executionId).toBe(outcome.failureKind !== "error");
		await f.db.execute(sql`UPDATE tickets SET completed_at=${f.ctx.now} WHERE id=${f.input.ticket}`);
		const fresh = databaseStore(f.ctx);
		const replay = await f.run((tx) => reserve(f.ctx, tx, f.input, { ...f.deps, store: fresh }));
		expect(replay.execution.executionId).toBe(execution.executionId);
		await expect(f.start({ ...f.input, headSha: "b".repeat(40) })).rejects.toThrow("different flow start");
	});

test("a permanent alias retains its run after a later explicit repeat", async () => {
	const f = await setup();
	const first = await f.start();
	const alias = { ...f.input, requestId: crypto.randomUUID(), expectedVersion: 99 };
	expect((await f.start(alias)).execution.executionId).toBe(first.execution.executionId);
	const repeated = await f.run((tx) =>
		reserve(
			f.ctx,
			tx,
			{ ...f.input, requestId: crypto.randomUUID(), allowRepeat: true, repeatReason: "Human requested repeat" },
			f.deps,
		),
	);
	expect(repeated.execution.executionId).not.toBe(first.execution.executionId);
	expect((await f.start(alias)).execution.executionId).toBe(first.execution.executionId);
});

test("legacy requests and reused legacy runs retain their identities", async () => {
	const f = await setup();
	const legacy = await f.run((tx) => legacyStart(f.ctx, tx, f.input));
	expect((await f.start()).execution.executionId).toBe(legacy.id);
	const alias = { ...f.input, requestId: crypto.randomUUID() };
	expect((await f.start(alias)).execution.executionId).toBe(legacy.id);
	await f.run((tx) =>
		reserve(
			f.ctx,
			tx,
			{ ...f.input, requestId: crypto.randomUUID(), allowRepeat: true, repeatReason: "Switch to published engine" },
			f.deps,
		),
	);
	expect((await f.start(alias)).execution.executionId).toBe(legacy.id);
	await expect(f.start({ ...alias, expectedVersion: 99 })).rejects.toThrow("different flow start");
});

test("lost admission response recovers the same committed receipt and job", async () => {
	const f = await setup();
	const first = await f.start();
	if (first.execution.engine !== "langflow") throw new Error("fixture_engine");
	const execution = first.execution;
	const sample = fixture();
	const correlation = {
		version: 1 as const,
		hostId: execution.hostId,
		executionId: execution.executionId,
		publicationId: execution.publicationId,
		submissionDigest: execution.submission.submissionDigest,
		engineJobId: "00000000-0000-4000-8000-000000000001",
		engineSessionId: "session-1",
		recordedAt: f.ctx.now.toISOString(),
	};
	const authority = {
		...(await sample.authorize({ correlation })),
		executionId: execution.executionId,
		projectId: execution.projectId,
		publicationDigest: execution.publication.documentHash,
	};
	const key = { executionId: execution.executionId };
	const context = { newTx: f.run, now: () => f.ctx.now };
	let calls = 0;
	const receipts: string[] = [];
	const engine = {
		...sample.engine,
		lookup: async () => ({ state: "found" as const, receipt: correlation }),
		submit: async () => {
			throw new Error("duplicate_submission");
		},
		admit: async ({ receipt }: Parameters<typeof sample.engine.admit>[0]) => {
			const [row] = await f.db
				.select()
				.from(langflowExecutions)
				.where(eq(langflowExecutions.executionId, execution.executionId));
			expect(row!.correlation).toEqual(correlation);
			expect(row!.admission).toEqual({ state: "open", receipt });
			const [outbox] = await f.db.select().from(langflowOutbox);
			expect(JSON.parse(outbox!.payloadBytes)).toEqual(receipt);
			receipts.push(receipt.admissionId);
			return ++calls === 1 ? { state: "unknown" as const } : { state: "admitted" as const, receipt };
		},
	};
	expect(
		(await reconcile(context, key, { store: f.store, engine, authorize: async () => authority })).disposition,
	).toBe("unknown");
	expect(
		(
			await reconcile(context, key, {
				store: databaseStore(f.ctx),
				engine,
				authorize: async () => {
					throw new Error("duplicate_authority");
				},
			})
		).disposition,
	).toBe("queued");
	expect(receipts[0]).toBe(receipts[1]);
	const [outbox] = await f.db.select().from(langflowOutbox);
	expect(outbox!.receipt).not.toBeNull();
});
