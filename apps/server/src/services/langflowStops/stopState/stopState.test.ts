import { afterEach, expect, test } from "bun:test";
import { SYSTEM_ACTOR } from "../../../context";
import { readProjection } from "../../../db/queries/langflowExecution";
import { ids } from "../../../db/queries/langflowExecution/fixtures/fixture";
import { stopFixture } from "../../langflowTestFixture";
import { cancelView } from "../cancelView";
import { stopState } from "./stopState";

let fixture: Awaited<ReturnType<typeof stopFixture>>;
afterEach(async () => fixture.db.$client.close());

test("the system state boundary rejects human and wrong-host reads", async () => {
	fixture = await stopFixture();
	const input = { operation: "read" as const, hostId: fixture.authority.hostId, input: { executionId: ids.execution } };
	await expect(fixture.run((tx) => stopState(fixture.core, tx, input))).rejects.toThrow("authority_conflict");
	await expect(
		fixture.run((tx) => stopState({ ...fixture.core, actor: SYSTEM_ACTOR }, tx, { ...input, hostId: "other" })),
	).rejects.toThrow("stop_host_conflict");
});

test("stop settlement and public needsStop roll back together", async () => {
	fixture = await stopFixture();
	await fixture.run((tx) => cancelView(fixture.core, tx, { id: ids.execution, expectedRevision: 1 }));
	const ctx = { ...fixture.core, actor: SYSTEM_ACTOR };
	const input = { hostId: fixture.authority.hostId, input: { executionId: ids.execution } };
	const before = await fixture.run((tx) => readProjection(tx, input.input));
	const stops = await fixture.run((tx) => stopState(ctx, tx, { ...input, operation: "stops" }));
	if (!Array.isArray(stops)) throw new Error("fixture_stops");
	const stop = stops[0]!;
	if (!("obligationId" in stop)) throw new Error("fixture_stops");
	await expect(
		fixture.run(async (tx) => {
			await stopState(ctx, tx, {
				hostId: input.hostId,
				operation: "settle",
				input: {
					expectedRevision: stop.revision,
					obligation: {
						...stop,
						revision: stop.revision + 1,
						state: "confirmed",
						exitReceipt: {
							attemptId: stop.attemptId,
							receiptId: stop.obligationId,
							exitedAt: fixture.core.now.toISOString(),
							confirmedAt: fixture.core.now.toISOString(),
						},
					},
				},
			});
			throw new Error("abort");
		}),
	).rejects.toThrow("abort");
	expect(await fixture.run((tx) => readProjection(tx, input.input))).toEqual(before);
	expect(await fixture.run((tx) => stopState(ctx, tx, { ...input, operation: "stops" }))).toEqual(stops);
});
