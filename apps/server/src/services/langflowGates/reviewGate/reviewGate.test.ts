import { afterAll, beforeAll, expect, test } from "bun:test";
import { testFixture } from "../../flowExecutions/testFixture";
import type { ServiceCtx } from "../../support.ts";
import { type ReviewGateInput, reviewGate } from "./reviewGate.ts";
import { testStore } from "./testStore.ts";

let h: Awaited<ReturnType<typeof testFixture>>;
beforeAll(async () => {
	h = await testFixture();
}, 30_000);
afterAll(async () => {
	await h.db.$client.close();
});
async function fixture() {
	const setup = await h.createExecution();
	const execution = await setup.create();
	const input: ReviewGateInput = {
		executionId: execution.id,
		diffId: setup.input.diffId,
		reviewedHead: setup.input.headSha,
		publication: {
			publicationId: "publication",
			gates: [
				{ nodeId: "front", reviewArea: "frontend" },
				{ nodeId: "back", reviewArea: "backend" },
			],
		},
		gateNodeId: "front",
	};
	const ctx: Pick<ServiceCtx, "newTx" | "log"> = { newTx: h.run, log: () => {} };
	return { input, ctx, ...testStore() };
}

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
	f.interrupt();
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
