import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { classificationStore } from "../../../db/queries/langflowExecution/classification.ts";
import { cancelExecution } from "../../../db/queries/langflowExecution/stops.ts";
import { openTestDbFromArchive } from "../../../db/testDb.ts";
import { testFixture } from "../../flowExecutions/testFixture";
import { createTables } from "./components/createTables";
import { gateFixture } from "./components/fixture";
import { reviewGate } from "./reviewGate.ts";

let h: Awaited<ReturnType<typeof testFixture>>;
beforeAll(async () => {
	h = await testFixture();
	await createTables(h.db);
}, 30_000);
afterAll(async () => {
	await h.db.$client.close();
});
const fixture = () => gateFixture(h);

for (const [choice, front, back] of [
	["frontend", "yes", "no"],
	["backend", "no", "yes"],
	["both", "yes", "yes"],
	["neither", "no", "no"],
] as const)
	test(`one saved ${choice} classification supplies both gates`, async () => {
		const f = await fixture();
		let calls = 0;
		const deps = {
			pullRequestChangedFilePaths: async () => ["src/a.tsx"],
			evaluate: async () => {
				calls++;
				return { answers: { area: { type: "choice" as const, choice } } };
			},
		};
		const frontend = await reviewGate(f.ctx, f.input, f.store, deps);
		const backend = await reviewGate(f.ctx, { ...f.input, gateNodeId: "back" }, f.store, deps);
		expect(frontend).toMatchObject({ state: "succeeded", decision: front });
		expect(backend).toMatchObject({ state: "succeeded", decision: back });
		expect(frontend.receipt).toEqual(backend.receipt);
		expect(calls).toBe(1);
		expect(
			(await h.db.execute(sql`SELECT * FROM langflow_native_handles WHERE execution_id=${f.input.executionId}`)).rows,
		).toHaveLength(0);
	});

test("concurrent gate reads remain pending; interruption rejects the late provider answer", async () => {
	const f = await fixture();
	const entered = Promise.withResolvers<void>();
	const answer = Promise.withResolvers<{ answers: { area: { type: "choice"; choice: string } } }>();
	let calls = 0;
	const deps = {
		pullRequestChangedFilePaths: async () => ["src/a.tsx"],
		evaluate: async () => {
			calls++;
			entered.resolve();
			return answer.promise;
		},
	};
	const first = reviewGate(f.ctx, f.input, f.store, deps);
	await entered.promise;
	const other = await reviewGate(f.ctx, { ...f.input, gateNodeId: "back" }, f.store, deps);
	expect(other.state).toBe("pending");
	await f.interrupt();
	answer.resolve({ answers: { area: { type: "choice", choice: "both" } } });
	expect(await first).toMatchObject({ state: "failed", error: "Jev gate: interrupted" });
	expect(await reviewGate(f.ctx, f.input, f.store, deps)).toMatchObject({ state: "failed" });
	expect(calls).toBe(1);
});

test("a provider error remains failed on repeat calls", async () => {
	const f = await fixture();
	let calls = 0;
	const deps = {
		pullRequestChangedFilePaths: async () => ["src/a.tsx"],
		evaluate: async () => {
			calls++;
			throw new Error("HTTP 503");
		},
	};
	for (const gateNodeId of ["front", "back"])
		expect(await reviewGate(f.ctx, { ...f.input, gateNodeId }, f.store, deps)).toMatchObject({
			state: "failed",
			error: "Jev gate: HTTP 503",
		});
	expect(calls).toBe(1);
});

test("a reopened database reuses a saved classification without a provider call", async () => {
	const f = await fixture();
	const deps = {
		pullRequestChangedFilePaths: async () => ["src/a.tsx"],
		evaluate: async () => ({ answers: { area: { type: "choice" as const, choice: "both" } } }),
	};
	const original = await reviewGate(f.ctx, f.input, f.store, deps);
	const archive = await h.db.$client.dumpDataDir("none");
	const reopened = await openTestDbFromArchive(archive);
	const ctx = { ...f.ctx, newTx: <T>(fn: Parameters<typeof h.run<T>>[0]) => reopened.transaction(fn) };
	const result = await reviewGate(ctx, { ...f.input, gateNodeId: "back" }, classificationStore, {
		pullRequestChangedFilePaths: async () => {
			throw new Error("must not read GitHub");
		},
		evaluate: async () => {
			throw new Error("must not call provider");
		},
	});
	expect(result).toMatchObject({ state: "succeeded", decision: "yes", receipt: original.receipt });
	await reopened.$client.close();
});

test("changed publication settings or reviewed identity cannot reuse a classification", async () => {
	const f = await fixture();
	const deps = {
		pullRequestChangedFilePaths: async () => ["src/a.tsx"],
		evaluate: async () => ({ answers: { area: { type: "choice" as const, choice: "both" } } }),
	};
	await reviewGate(f.ctx, f.input, f.store, deps);
	for (const input of [
		{ ...f.input, reviewedHead: "different-head" },
		{ ...f.input, diffId: "different-diff" },
		{ ...f.input, publication: { ...f.input.publication, publicationId: "different-publication" } },
		{
			...f.input,
			publication: { ...f.input.publication, gates: [{ nodeId: "front", reviewArea: "backend" as const }] },
		},
	])
		await expect(reviewGate(f.ctx, input, f.store, deps)).rejects.toThrow("classification_conflict");
});

test("cancellation prevents a late provider answer from becoming a gate decision", async () => {
	const f = await fixture();
	const entered = Promise.withResolvers<void>();
	const answer = Promise.withResolvers<{ answers: { area: { type: "choice"; choice: string } } }>();
	const work = reviewGate(f.ctx, f.input, f.store, {
		pullRequestChangedFilePaths: async () => ["src/a.tsx"],
		evaluate: async () => {
			entered.resolve();
			return answer.promise;
		},
	});
	await entered.promise;
	await h.run((tx) =>
		cancelExecution(tx, {
			intent: {
				version: 1,
				executionId: f.input.executionId,
				requestId: crypto.randomUUID(),
				actor: { kind: "human", name: "Test" },
				expectedRevision: 1,
				requestedAt: h.ctx.now.toISOString(),
			},
			obligations: [],
		}),
	);
	answer.resolve({ answers: { area: { type: "choice", choice: "both" } } });
	expect(await work).toMatchObject({ state: "failed", error: "Execution ended before classification completed." });
	expect(f.logs.at(-1)).toEqual([
		"flow.review-gate",
		{
			executionId: f.input.executionId,
			receiptId: expect.any(String),
			gateNodeId: "front",
			area: "frontend",
			state: "failed",
			decision: null,
			failureKind: "classification_failed",
		},
	]);
});

test("recovery fails an unfinished claim after a database reopen without another provider call", async () => {
	const f = await fixture();
	const claim = await h.run((tx) =>
		classificationStore.claim(tx, {
			binding: {
				executionId: f.input.executionId,
				publicationId: f.input.publication.publicationId,
				diffId: f.input.diffId,
				reviewedHead: f.input.reviewedHead,
			},
			ownerToken: crypto.randomUUID(),
			requestBytes: JSON.stringify({ gates: [...f.input.publication.gates].reverse() }),
		}),
	);
	const reopened = await openTestDbFromArchive(await h.db.$client.dumpDataDir("none"));
	const ctx = { ...f.ctx, newTx: <T>(fn: Parameters<typeof h.run<T>>[0]) => reopened.transaction(fn) };
	await ctx.newTx((tx) =>
		classificationStore.interrupt(tx, {
			executionId: f.input.executionId,
			ownerToken: claim.receipt.ownerToken,
			error: "Jev gate: interrupted",
		}),
	);
	expect(
		await reviewGate(ctx, f.input, classificationStore, {
			pullRequestChangedFilePaths: async () => {
				throw new Error("must not read GitHub");
			},
			evaluate: async () => {
				throw new Error("must not call provider");
			},
		}),
	).toMatchObject({ state: "failed", error: "Jev gate: interrupted", receipt: { receiptId: claim.receipt.receiptId } });
	await reopened.$client.close();
});
