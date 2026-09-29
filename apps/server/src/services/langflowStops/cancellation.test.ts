import { afterEach, expect, test } from "bun:test";
import {
	commitProjection,
	listPendingDeliveries,
	readExecution,
	readProjectionFacts,
	recordDecision,
	reserveNative,
} from "../../db/queries/langflowExecution";
import { ids, now } from "../../db/queries/langflowExecution/fixtures/fixture";
import { handle } from "../../db/queries/langflowExecution/fixtures/native";
import type { HumanDecisionReceiptV1 } from "../../langflowContracts";
import { recordExpiredStops } from "../langflowClocks/recordExpiredStops";
import { stopFixture } from "../langflowTestFixture";
import { assertExecutionNotCanceled } from "./assertExecutionNotCanceled";
import { cancelExecution } from "./cancelExecution";
import { drainStops } from "./drainStops";

let fixture: Awaited<ReturnType<typeof stopFixture>>;
afterEach(async () => {
	await fixture.db.$client.close();
});
const input = { id: ids.execution, expectedRevision: 1 };

test("cancel before launch commits intent and stop obligations before a failed external stop", async () => {
	fixture = await stopFixture();
	const canceled = await fixture.run((tx) => cancelExecution(fixture.core, tx, input));
	expect(canceled.needsStop).toBe(true);
	const outbox = await fixture.run((tx) =>
		listPendingDeliveries(tx, { executionId: input.id, afterId: "", afterKind: "", limit: 100 }),
	);
	expect(outbox.find((row) => row.kind === "cancel")?.payloadBytes).toBe(JSON.stringify(canceled.intent));
	const result = await drainStops(
		fixture.io,
		{ executionId: input.id },
		{
			stop: async (attemptId) => {
				expect(attemptId).toBe(handle.attemptId);
				const stored = await fixture.run((tx) => readExecution(tx, { executionId: input.id }));
				expect(stored!.cancelIntent).toEqual(canceled.intent);
				throw new Error("runtime unavailable");
			},
		},
	);
	expect(result.needsStop).toBe(true);
	expect(result.stops[0]!.state).toBe("ownership_unknown");
});

test("a canceled execution rejects downstream reservations and guarded effects", async () => {
	fixture = await stopFixture();
	await fixture.run((tx) => cancelExecution(fixture.core, tx, input));
	await expect(
		fixture.run((tx) => assertExecutionNotCanceled(fixture.core, tx, { executionId: input.id })),
	).rejects.toThrow("canceled");
	await expect(
		fixture.run((tx) =>
			reserveNative(tx, {
				requestBytes: JSON.stringify({
					...fixture.request,
					requestId: crypto.randomUUID(),
					nodeId: "next",
					occurrenceKey: "next",
				}),
				taskKey: "next",
				handle: { ...handle, stepId: "next", attemptId: crypto.randomUUID() },
				authority: fixture.authority,
				now,
			}),
		),
	).rejects.toThrow("admission_closed");
	expect((await fixture.run((tx) => readProjectionFacts(tx, { executionId: input.id }))).native).toHaveLength(1);
});

test("cancel and a human decision cannot authorize a new continuation", async () => {
	fixture = await stopFixture();
	await fixture.run((tx) => cancelExecution(fixture.core, tx, input));
	const decision: HumanDecisionReceiptV1 = {
		version: 1,
		decisionId: "decision-1",
		actor: { kind: "human", name: "fixture" },
		approved: true,
		output: "approve",
		recordedAt: now.toISOString(),
		wait: {
			version: 1,
			executionId: input.id,
			publicationId: ids.publication,
			engineJobId: fixture.request.engineJobId,
			engineEpoch: 1,
			engineRequestId: "wait-1",
			actionKey: "approve",
			expectedRevision: 2,
			deadlineRefs: [],
			occurrence: {
				nodeId: "human",
				occurrenceKey: "human",
				parentOccurrenceKey: null,
				phase: "step",
				iterationPath: [],
			},
		},
	};
	await expect(fixture.run((tx) => recordDecision(tx, { payloadBytes: JSON.stringify(decision) }))).rejects.toThrow(
		"decision_conflict",
	);
});

test("cancel during timeout preserves the original exact-attempt obligation", async () => {
	fixture = await stopFixture(true);
	const expired = { ...fixture.core, now: new Date(now.getTime() + 120_000) };
	const stops = await fixture.run((tx) => recordExpiredStops(expired, tx, { executionId: input.id }));
	expect(stops[0]!.reason).toBe("deadline");
	await fixture.run((tx) => cancelExecution(expired, tx, input));
	const facts = await fixture.run((tx) => readProjectionFacts(tx, { executionId: input.id }));
	expect(facts.stops).toEqual(stops);
	expect((await fixture.run((tx) => readExecution(tx, { executionId: input.id })))!.cancelIntent).not.toBeNull();
});

test("cancel rollback exposes no partial intent or stop obligation", async () => {
	fixture = await stopFixture();
	await expect(
		fixture.run(async (tx) => {
			await cancelExecution(fixture.core, tx, input);
			throw new Error("abort");
		}),
	).rejects.toThrow("abort");
	expect((await fixture.run((tx) => readExecution(tx, { executionId: input.id })))!.cancelIntent).toBeNull();
	expect((await fixture.run((tx) => readProjectionFacts(tx, { executionId: input.id }))).stops).toEqual([]);
});

test("only a human with the current revision can cancel", async () => {
	fixture = await stopFixture();
	await expect(
		fixture.run((tx) => cancelExecution({ ...fixture.core, actor: { kind: "agent", name: "fixture" } }, tx, input)),
	).rejects.toThrow();
	await expect(
		fixture.run((tx) => cancelExecution(fixture.core, tx, { ...input, expectedRevision: 2 })),
	).rejects.toThrow();
	expect((await fixture.run((tx) => readExecution(tx, { executionId: input.id })))!.cancelIntent).toBeNull();
});

test("cancel validates the visible revision and records the separate storage revision", async () => {
	fixture = await stopFixture();
	for (const revision of [1, 2]) {
		await fixture.run((tx) =>
			commitProjection(tx, {
				executionId: input.id,
				expectedRevision: revision,
				view: { ...fixture.view, revision: revision + 1 },
				event: null,
				sourceBytes: null,
			}),
		);
	}
	const stored = await fixture.run((tx) => readExecution(tx, { executionId: input.id }));
	expect(stored!.revision).toBe(2);
	await expect(
		fixture.run((tx) =>
			cancelExecution(fixture.core, tx, {
				...input,
				expectedRevision: 2,
			}),
		),
	).rejects.toMatchObject({ data: { version: 3 } });
	const canceled = await fixture.run((tx) =>
		cancelExecution(fixture.core, tx, {
			...input,
			expectedRevision: 3,
		}),
	);
	expect(canceled.intent.expectedRevision).toBe(2);
	expect(canceled.needsStop).toBe(true);
});
