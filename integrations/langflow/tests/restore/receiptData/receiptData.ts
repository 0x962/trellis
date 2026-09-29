import { sql } from "drizzle-orm";
import { recordDecision } from "../../../../../apps/server/src/db/queries/langflowExecution/decisions";
import { readProjectionFacts } from "../../../../../apps/server/src/db/queries/langflowExecution/facts";
import { ids, now, receiptFixture } from "../../../../../apps/server/src/db/queries/langflowExecution/fixtures/fixture";
import { handle, nativeRequest } from "../../../../../apps/server/src/db/queries/langflowExecution/fixtures/native";
import {
	recordCompletion,
	reserveNative,
	updateNativeHandle,
} from "../../../../../apps/server/src/db/queries/langflowExecution/native";
import { recordStop, updateStop } from "../../../../../apps/server/src/db/queries/langflowExecution/stops";
import {
	type NativeResultV1,
	protocolDigest,
	type StopObligationV1,
} from "../../../../../apps/server/src/langflowContracts";
import humanDecision from "../../../../../apps/server/src/langflowContracts/fixtures/human-decision.json";

export async function receiptData() {
	const fixture = await receiptFixture();
	const { db } = fixture;
	const request = {
		requestBytes: JSON.stringify(nativeRequest),
		taskKey: "outer/501/step",
		handle,
		authority: fixture.authority,
		now,
	};
	const reserved = await db.transaction((tx) => reserveNative(tx, request));
	const completed = {
		...handle,
		providerSessionId: "session-1",
		workspaceId: "workspace-1",
		state: "succeeded" as const,
		revision: 2,
	};
	await db.transaction((tx) =>
		updateNativeHandle(tx, { executionId: ids.execution, expectedRevision: 1, handle: completed }),
	);
	const result: NativeResultV1 = {
		version: 1,
		launchBinding: {
			executionId: ids.execution,
			publicationId: ids.publication,
			engineJobId: nativeRequest.engineJobId,
			engineEpoch: 1,
		},
		requestDigest: reserved.requestDigest,
		completionId: "completion-1",
		stepId: handle.stepId,
		agentRunId: handle.agentRunId,
		attemptId: handle.attemptId,
		providerSessionId: "session-1",
		promptReceiptId: handle.attemptId,
		resultId: "result-1",
		resultVersion: 1,
		output: "YES\n",
		outputHash: protocolDigest("YES\n"),
		artifactRefs: [],
		exitKind: "completed",
	};
	await db.transaction((tx) =>
		recordCompletion(tx, {
			resultBytes: JSON.stringify(result),
			completion: { version: 1, provenance: reserved.provenance, handle: completed, result },
		}),
	);
	const pending = { ...handle, stepId: "step-2", attemptId: "00000000-0000-4000-8000-000000000022" };
	await db.transaction((tx) =>
		reserveNative(tx, {
			...request,
			handle: pending,
			taskKey: "outer/501/pending",
			requestBytes: JSON.stringify({
				...nativeRequest,
				requestId: crypto.randomUUID(),
				nodeId: "pending",
				occurrenceKey: "pending",
			}),
		}),
	);
	for (const [index, native] of [completed, pending].entries()) {
		const stop: StopObligationV1 = {
			version: 1,
			obligationId: `stop-${index}`,
			executionId: ids.execution,
			stepId: native.stepId,
			agentRunId: native.agentRunId,
			attemptId: native.attemptId,
			reason: "engine_failure",
			requestedAt: now.toISOString(),
			revision: 1,
			state: "pending",
			exitReceipt: null,
		};
		await db.transaction((tx) => recordStop(tx, { obligation: stop }));
		await db.transaction((tx) =>
			updateStop(tx, {
				expectedRevision: 1,
				obligation:
					index === 0
						? {
								...stop,
								revision: 2,
								state: "confirmed",
								exitReceipt: {
									attemptId: native.attemptId,
									receiptId: "exit-1",
									exitedAt: now.toISOString(),
									confirmedAt: now.toISOString(),
								},
							}
						: { ...stop, revision: 2, state: "ownership_unknown" },
			}),
		);
	}
	const payloadBytes = JSON.stringify({
		...humanDecision,
		wait: { ...humanDecision.wait, executionId: ids.execution, publicationId: ids.publication },
	});
	await db.transaction((tx) => recordDecision(tx, { payloadBytes }));
	await db.execute(sql`INSERT INTO flow_executions VALUES ('legacy-run')`);
	await db.execute(sql`CREATE TABLE restore_review_fixture (id text PRIMARY KEY, body text NOT NULL)`);
	await db.execute(sql`INSERT INTO restore_review_fixture VALUES ('review-before', 'Retained finding')`);
	const facts = await db.transaction((tx) => readProjectionFacts(tx, { executionId: ids.execution }));
	return { db, facts, ids, request, payloadBytes };
}
