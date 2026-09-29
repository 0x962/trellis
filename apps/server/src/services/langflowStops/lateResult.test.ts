import { afterEach, expect, test } from "bun:test";
import {
	listPendingDeliveries,
	readExecution,
	recordCompletion,
	updateNativeHandle,
} from "../../db/queries/langflowExecution";
import { ids } from "../../db/queries/langflowExecution/fixtures/fixture";
import { handle } from "../../db/queries/langflowExecution/fixtures/native";
import { type NativeResultV1, protocolDigest } from "../../langflowContracts";
import { assertExecutionActive } from "./assertExecutionActive";
import { cancelExecution } from "./cancelExecution";
import { stopFixture } from "./testFixture";

let fixture: Awaited<ReturnType<typeof stopFixture>>;
afterEach(async () => {
	await fixture.db.$client.close();
});

test("a result after cancel remains audit data and cannot authorize downstream effects", async () => {
	fixture = await stopFixture(true);
	const completed = { ...handle, providerSessionId: "session-1", state: "succeeded" as const, revision: 2 };
	await fixture.run((tx) =>
		updateNativeHandle(tx, { executionId: ids.execution, expectedRevision: 1, handle: completed }),
	);
	const canceled = await fixture.run((tx) =>
		cancelExecution(fixture.core, tx, { id: ids.execution, expectedRevision: 2 }),
	);
	const result: NativeResultV1 = {
		version: 1,
		launchBinding: {
			executionId: ids.execution,
			publicationId: ids.publication,
			engineJobId: fixture.request.engineJobId,
			engineEpoch: 1,
		},
		requestDigest: fixture.reservation.requestDigest,
		completionId: "completion-1",
		stepId: handle.stepId,
		agentRunId: handle.agentRunId,
		attemptId: handle.attemptId,
		providerSessionId: "session-1",
		promptReceiptId: handle.attemptId,
		resultId: "result-1",
		resultVersion: 1,
		output: "done",
		outputHash: protocolDigest("done"),
		artifactRefs: [],
		exitKind: "completed",
	};
	await fixture.run((tx) =>
		recordCompletion(tx, {
			resultBytes: JSON.stringify(result),
			completion: {
				version: 1,
				provenance: fixture.reservation.provenance,
				handle: completed,
				result,
			},
		}),
	);
	const stored = await fixture.run((tx) => readExecution(tx, { executionId: ids.execution }));
	expect(stored!.cancelIntent).toEqual(canceled.intent);
	const pending = await fixture.run((tx) =>
		listPendingDeliveries(tx, { executionId: ids.execution, afterId: "", afterKind: "", limit: 100 }),
	);
	expect(pending.every((row) => row.kind === "cancel")).toBe(true);
	await expect(
		fixture.run((tx) => assertExecutionActive(fixture.core, tx, { executionId: ids.execution })),
	).rejects.toThrow("canceled");
});
