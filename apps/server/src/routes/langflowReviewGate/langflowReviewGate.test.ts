import { afterAll, beforeAll, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { langflowExecutions, langflowNativeHandles } from "../../db/tables/langflowExecution";
import { protocolDigest } from "../../langflowContracts";
import { testFixture } from "../../services/flowExecutions/testFixture";
import { invocationFixture } from "./components/fixture";

let h: Awaited<ReturnType<typeof testFixture>>;
const cleanups: Array<() => void> = [];
beforeAll(async () => { h = await testFixture(); }, 30_000);
afterAll(async () => {
	await h.db.$client.close();
	for (const cleanup of cleanups) cleanup();
});
const fixture = async (choice = "both", wait?: () => Promise<void>) => {
	let calls = 0;
	const f = await invocationFixture(h, {
		pullRequestChangedFilePaths: async () => ["ui.tsx", "server.ts"],
		evaluate: async () => {
			calls++;
			await wait?.();
			return { answers: { area: { type: "choice" as const, choice } } };
		},
	});
	cleanups.push(f.cleanup);
	return { ...f, calls: () => calls };
};

for (const [choice, front, back] of [
	["frontend", true, false], ["backend", false, true], ["both", true, true], ["neither", false, false],
] as const) test(`mounted HTTP retains one ${choice} receipt for both branches`, async () => {
	const f = await fixture(choice);
	const first = await (await f.send()).json();
	const second = await (await f.send()).json();
	expect(first).toEqual(second);
	expect(first).toMatchObject({ result: { state: "succeeded", relevance: { frontend: front, backend: back } } });
	const backend = { ...f.request, requestId: crypto.randomUUID(), nodeId: "back", occurrenceKey: "back:step:1",
		specHash: protocolDigest(JSON.stringify({ nodeId: "back", reviewArea: "backend" })) };
	f.requests.set(backend.occurrenceKey, JSON.stringify(backend));
	expect(await (await f.send(backend)).json()).toMatchObject({ result: first.result });
	expect(f.calls()).toBe(1);
	expect(f.gate.read().permits.filter((entry) => entry.permit.binding.kind === "review-classification")).toHaveLength(1);
	expect(f.gate.read().permits[0]!.terminal).not.toBeNull();
	expect(await h.run((tx) => tx.select().from(langflowNativeHandles).where(eq(langflowNativeHandles.executionId, f.request.executionId)))).toEqual([]);
});

test("unauthenticated calls fail before a provider call", async () => {
	const f = await fixture();
	expect((await f.send(f.request, { Authorization: "" })).status).toBe(401);
	expect((await f.send(f.request, { Authorization: "Bearer wrong" })).status).toBe(401);
	expect((await f.send(f.request, { "X-Trellis-Capability-Id": "wrong" })).status).toBe(403);
	expect((await f.send(f.request, { Origin: "https://foreign.example" })).status).toBe(403);
	f.ctx.withAuthenticatedEngine = async () => { throw new Error("authority_conflict"); };
	expect((await f.send()).status).toBe(403);
	expect(f.calls()).toBe(0);
});

test("changed execution identities, occurrence bytes and request gate lists fail", async () => {
	const f = await fixture();
	for (const changes of [{ publicationId: "other" }, { engineEpoch: 2 }, { diffId: "other" }, { reviewedHead: "changed" }])
		expect((await f.send({ ...f.request, ...changes })).status).toBe(409);
	expect((await f.send({ ...f.request, occurrenceKey: "unrecorded" })).status).toBe(409);
	expect((await f.send({ ...f.request, gates: [] })).status).toBe(400);
	expect(f.calls()).toBe(0);
});

test("expired authority refuses a retained receipt", async () => {
	const f = await fixture();
	await f.send();
	f.ctx.now = () => new Date(h.ctx.now.getTime() + 120000);
	expect((await f.send()).status).toBe(403);
	expect(f.calls()).toBe(1);
});

test("pending frontend and backend reads cannot settle an interrupted provider", async () => {
	const entered = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const f = await fixture("both", async () => { entered.resolve(); await release.promise; });
	const running = f.send();
	await entered.promise;
	const pending = await (await f.send()).json();
	expect(pending.result.state).toBe("claimed");
	const backend = { ...f.request, requestId: crypto.randomUUID(), nodeId: "back", occurrenceKey: "back:step:1",
		specHash: protocolDigest(JSON.stringify({ nodeId: "back", reviewArea: "backend" })) };
	f.requests.set(backend.occurrenceKey, JSON.stringify(backend));
	expect(await (await f.send(backend)).json()).toMatchObject({ result: { state: "claimed", classificationReceiptId: pending.result.classificationReceiptId } });
	await f.interrupt();
	expect(await (await f.send()).json()).toMatchObject({ result: { state: "failed", classificationReceiptId: pending.result.classificationReceiptId } });
	expect(f.gate.read().permits[0]!.terminal).toBeNull();
	release.resolve();
	expect(await (await running).json()).toMatchObject({ result: { state: "failed", classificationReceiptId: pending.result.classificationReceiptId } });
	expect(f.gate.read().permits[0]!.terminal).not.toBeNull();
	expect(f.calls()).toBe(1);
});

test("an unknown transport outcome retains its permit after failed replay", async () => {
	const f = await fixture("both", async () => { throw new Error("transport outcome unknown"); });
	const failed = await (await f.send()).json();
	expect(failed.result.state).toBe("failed");
	expect(await (await f.send()).json()).toEqual(failed);
	expect(f.gate.read().permits[0]!.terminal).toBeNull();
	expect(f.calls()).toBe(1);
});

test("cancellation preserves the failed classification for replay", async () => {
	const entered = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const f = await fixture("both", async () => { entered.resolve(); await release.promise; });
	const running = f.send();
	await entered.promise;
	await h.run((tx) => tx.update(langflowExecutions).set({ cancelIntent: {
		version: 1, executionId: f.request.executionId, requestId: crypto.randomUUID(),
		expectedRevision: 1, actor: { kind: "human", name: "Test" }, requestedAt: h.ctx.now.toISOString(),
	} }).where(eq(langflowExecutions.executionId, f.request.executionId)));
	release.resolve();
	expect((await (await running).json()).result.state).toBe("failed");
	expect((await (await f.send()).json()).result.state).toBe("failed");
	expect(f.calls()).toBe(1);
});

for (const error of ["Changed file list is incomplete.", "Pull request head changed."])
	test(`complete-path boundary preserves ${error}`, async () => {
		let calls = 0;
		const f = await invocationFixture(h, {
			pullRequestChangedFilePaths: async () => { throw new Error(error); },
			evaluate: async () => { calls++; return { answers: { area: { type: "choice" as const, choice: "both" } } }; },
		});
		cleanups.push(f.cleanup);
		const result = await (await f.send()).json();
		expect(result).toMatchObject({ result: { state: "failed", error: `Jev gate: ${error}` } });
		expect(await (await f.send()).json()).toEqual(result);
		expect(calls).toBe(0);
	});

test("a changed saved document cannot authorize classification", async () => {
	const f = await fixture();
	await h.run(async (tx) => {
		const [row] = await tx.select().from(langflowExecutions).where(eq(langflowExecutions.executionId, f.request.executionId));
		await tx.update(langflowExecutions).set({ snapshot: { ...row!.snapshot, documentHash: "b".repeat(64) } })
			.where(eq(langflowExecutions.executionId, f.request.executionId));
	});
	expect((await f.send()).status).toBe(409);
	expect(f.calls()).toBe(0);
});

test("context reconstructs the shared bytes without a provider or claim", async () => {
	const f = await fixture();
	const response = await f.sendContext();
	expect(response.status).toBe(200);
	const context = await response.json();
	expect(context.requestDigest).toBe(f.request.classificationRequestDigest);
	expect(JSON.parse(context.requestBytes)).toMatchObject({ executionId: f.request.executionId,
		diffId: f.request.diffId, reviewedHead: f.request.reviewedHead,
		gates: [{ nodeId: "back", reviewArea: "backend" }, { nodeId: "front", reviewArea: "frontend" }] });
	expect(f.calls()).toBe(0);
	expect(f.gate.read().permits).toHaveLength(0);
});

test("an unknown delivery preserves its permit and repeats the same classification", async () => {
	const f = await fixture();
	const accept = f.ctx.accept;
	f.ctx.accept = async () => ({ state: "unknown" });
	const response = await (await f.send()).json();
	expect(response.result.state).toBe("succeeded");
	const delivery = () => f.gate.read().permits.filter((entry) => entry.permit.binding.kind === "engine-delivery");
	expect(delivery()).toHaveLength(1);
	expect(delivery()[0]!.terminal).toBeNull();
	f.ctx.accept = accept;
	expect(await (await f.send()).json()).toEqual(response);
	expect(delivery()).toHaveLength(1);
	expect(delivery()[0]!.terminal).not.toBeNull();
	expect(f.calls()).toBe(1);
});

test("a classification digest from another request cannot acquire a provider permit", async () => {
	const f = await fixture();
	const changed = { ...f.request, classificationRequestDigest: "a".repeat(64) };
	f.requests.set(changed.occurrenceKey, JSON.stringify(changed));
	expect((await f.send(changed)).status).toBe(409);
	expect(f.calls()).toBe(0);
	expect(f.gate.read().permits).toHaveLength(0);
});
