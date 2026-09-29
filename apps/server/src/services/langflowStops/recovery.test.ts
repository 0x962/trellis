import { afterEach, expect, test } from "bun:test";
import { readExecution, readProjectionFacts } from "../../db/queries/langflowExecution";
import { ids, now } from "../../db/queries/langflowExecution/fixtures/fixture";
import { handle } from "../../db/queries/langflowExecution/fixtures/native";
import { openTestDbFromArchive } from "../../db/testDb";
import type { Tx } from "../../db/tx";
import { recordExpiredStops } from "../langflowClocks";
import { stopFixture } from "../langflowTestFixture";
import { assertExecutionNotCanceled } from "./assertExecutionNotCanceled";
import { cancelExecution } from "./cancelExecution";
import { drainStops } from "./drainStops";
import { readStopReconciliation } from "./readStopReconciliation";
import { withAttemptOperation } from "./withAttemptOperation";

let fixture: Awaited<ReturnType<typeof stopFixture>>;
let restored: Awaited<ReturnType<typeof openTestDbFromArchive>> | undefined;
afterEach(async () => {
	if (restored) await restored.$client.close();
	else await fixture.db.$client.close();
	restored = undefined;
});
const input = { executionId: ids.execution };
const exited = {
	id: handle.attemptId,
	daemonId: "runtime-1",
	pid: null,
	mode: "pty" as const,
	status: "exited" as const,
	startedAt: now.toISOString(),
	endedAt: new Date(now.getTime() + 130_000).toISOString(),
	exitCode: 0,
	error: null,
};

test("restore retains cancellation and the launch deadline until exact exit confirmation", async () => {
	fixture = await stopFixture(true);
	await fixture.run((tx) => recordExpiredStops({ ...fixture.core, now: new Date(now.getTime() + 120_000) }, tx, input));
	await fixture.run((tx) => cancelExecution(fixture.core, tx, { id: ids.execution, expectedRevision: 1 }));
	await drainStops(fixture.io, input, {
		stop: async () => {
			throw new Error("runtime unavailable");
		},
	});
	const proofInput = { dataHomeId: "data-home-1", blockId: "restore-1", generation: 2 };
	const proof = await fixture.run((tx) => readStopReconciliation(fixture.core, tx, proofInput));
	expect(proof.unconfirmed).toHaveLength(1);
	const before = await fixture.run((tx) => readProjectionFacts(tx, input));
	const archive = await fixture.db.$client.dumpDataDir();
	await fixture.db.$client.close();
	restored = await openTestDbFromArchive(archive);
	const run = <T>(action: (tx: Tx) => Promise<T>) => restored!.transaction(action);
	expect(await run((tx) => readStopReconciliation(fixture.core, tx, proofInput))).toEqual(proof);
	const other = await run((tx) => readStopReconciliation(fixture.core, tx, { ...proofInput, generation: 3 }));
	expect(other.receiptId).not.toBe(proof.receiptId);
	const after = await run((tx) => readProjectionFacts(tx, input));
	expect(after.stops).toEqual(before.stops);
	expect(after.deadlines).toEqual(before.deadlines);
	expect(after.deadlines[0]!.deadlineAt).toBe(new Date(now.getTime() + 120_000).toISOString());
	expect((await run((tx) => readExecution(tx, input)))!.cancelIntent).not.toBeNull();
	await expect(run((tx) => assertExecutionNotCanceled(fixture.core, tx, input))).rejects.toThrow("canceled");
	const calls: string[] = [];
	const io = { ...fixture.io, newTx: run };
	const result = await drainStops(io, input, {
		stop: async (attemptId) => {
			calls.push(attemptId);
			return exited;
		},
	});
	expect(calls).toEqual([handle.attemptId]);
	expect(result.needsStop).toBe(false);
	const settled = await run((tx) => readStopReconciliation(fixture.core, tx, proofInput));
	expect(settled.receiptId).not.toBe(proof.receiptId);
	expect(settled.unconfirmed).toEqual([]);
	expect(result.stops[0]!.obligationId).toBe(before.stops[0]!.obligationId);
	await drainStops(io, input, {
		stop: async () => {
			throw new Error("confirmed stop replayed");
		},
	});
}, 60_000);

test("stop confirmation waits for an in-flight launch submission", async () => {
	fixture = await stopFixture();
	const started = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const order: string[] = [];
	const launch = withAttemptOperation(fixture.io.home, handle.attemptId, async () => {
		order.push("authorized");
		started.resolve();
		await release.promise;
		order.push("submitted");
	});
	await started.promise;
	await fixture.run((tx) => cancelExecution(fixture.core, tx, { id: ids.execution, expectedRevision: 1 }));
	const stopped = drainStops(fixture.io, input, {
		stop: async () => {
			order.push("stopped");
			return exited;
		},
	});
	await Promise.resolve();
	expect(order).toEqual(["authorized"]);
	release.resolve();
	await launch;
	expect((await stopped).needsStop).toBe(false);
	expect(order).toEqual(["authorized", "submitted", "stopped"]);
	await expect(
		withAttemptOperation(fixture.io.home, handle.attemptId, () =>
			fixture.run((tx) => assertExecutionNotCanceled(fixture.core, tx, input)),
		),
	).rejects.toThrow("canceled");
}, 60_000);
