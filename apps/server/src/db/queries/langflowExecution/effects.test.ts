import { afterEach, expect, test } from "bun:test";
import type { HumanDecisionReceiptV1, StopObligationV1 } from "../../../langflowContracts";
import type { Db } from "../../client";
import { recordDecision, updateDecisionDelivery } from "./decisions";
import { readProjectionFacts } from "./facts";
import { ids, now, receiptFixture } from "./fixtures/fixture";
import { handle, nativeRequest } from "./fixtures/native";
import { reserveNative } from "./native";
import { cancelExecution, recordDeadline, updateStop } from "./stops";

let db: Db;
afterEach(async () => {
	await db.$client.close();
});
test("records one decision per exact wait and requires exact acceptance", async () => {
	({ db } = await receiptFixture());
	const decision: HumanDecisionReceiptV1 = {
		version: 1,
		decisionId: "decision-1",
		wait: {
			version: 1,
			executionId: ids.execution,
			publicationId: ids.publication,
			engineJobId: nativeRequest.engineJobId,
			engineEpoch: 1,
			occurrence: {
				nodeId: ids.node,
				occurrenceKey: "human",
				parentOccurrenceKey: null,
				phase: "step",
				iterationPath: [],
			},
			engineRequestId: "human-wait-1",
			actionKey: "approve",
			expectedRevision: 1,
			deadlineRefs: [],
		},
		actor: { kind: "human", name: "fixture" },
		approved: true,
		output: "x".repeat(200001),
		recordedAt: now.toISOString(),
	};
	const payloadBytes = JSON.stringify(decision);
	const saved = await db.transaction((tx) => recordDecision(tx, { payloadBytes }));
	expect(await db.transaction((tx) => recordDecision(tx, { payloadBytes }))).toEqual(saved);
	await expect(
		db.transaction((tx) =>
			recordDecision(tx, { payloadBytes: JSON.stringify({ ...decision, decisionId: "different" }) }),
		),
	).rejects.toThrow("identity_conflict");
	const acceptance = {
		version: 1 as const,
		executionId: ids.execution,
		engineJobId: nativeRequest.engineJobId,
		engineRequestId: "human-wait-1",
		decisionId: decision.decisionId,
		payloadDigest: saved.payloadDigest,
		acceptanceId: "accept-1",
		signalId: "signal-1",
		enqueueObligationId: "enqueue-1",
		acceptedAt: now.toISOString(),
	};
	await expect(
		db.transaction((tx) =>
			updateDecisionDelivery(tx, {
				executionId: ids.execution,
				decisionId: decision.decisionId,
				state: "confirmed",
				acceptance: { ...acceptance, payloadDigest: "f".repeat(64) },
			}),
		),
	).rejects.toThrow("decision_acceptance_conflict");
	const confirmed = await db.transaction((tx) =>
		updateDecisionDelivery(tx, {
			executionId: ids.execution,
			decisionId: decision.decisionId,
			state: "confirmed",
			acceptance,
		}),
	);
	expect(confirmed.state).toBe("confirmed");
	await expect(
		db.transaction((tx) =>
			updateDecisionDelivery(tx, {
				executionId: ids.execution,
				decisionId: decision.decisionId,
				state: "confirmed",
				acceptance: { ...acceptance, engineRequestId: "other" },
			}),
		),
	).rejects.toThrow("decision_acceptance_conflict");
	expect(
		await db.transaction((tx) =>
			updateDecisionDelivery(tx, { executionId: ids.execution, decisionId: decision.decisionId, state: "unknown" }),
		),
	).toEqual(confirmed);
});
test("cancel and exact-attempt stops share the caller transaction", async () => {
	const fixture = await receiptFixture();
	db = fixture.db;
	await db.transaction((tx) =>
		reserveNative(tx, {
			requestBytes: JSON.stringify(nativeRequest),
			taskKey: "outer/501/step",
			handle,
			authority: fixture.authority,
			now,
		}),
	);
	const intent = {
		version: 1 as const,
		executionId: ids.execution,
		requestId: crypto.randomUUID(),
		actor: { kind: "human" as const, name: "fixture" },
		expectedRevision: 2,
		requestedAt: now.toISOString(),
	};
	await expect(db.transaction((tx) => cancelExecution(tx, { intent, obligations: [] }))).rejects.toThrow(
		"missing_stop_obligation",
	);
	const obligation: StopObligationV1 = {
		version: 1,
		obligationId: "stop-1",
		executionId: ids.execution,
		stepId: handle.stepId,
		agentRunId: handle.agentRunId,
		attemptId: handle.attemptId,
		reason: "canceled",
		requestedAt: now.toISOString(),
		revision: 1,
		state: "pending",
		exitReceipt: null,
	};
	await db.transaction((tx) => cancelExecution(tx, { intent, obligations: [obligation] }));
	const unknown = { ...obligation, state: "ownership_unknown" as const, revision: 2 };
	await db.transaction((tx) => updateStop(tx, { expectedRevision: 1, obligation: unknown }));
	await expect(
		db.transaction((tx) =>
			updateStop(tx, {
				expectedRevision: 2,
				obligation: {
					...unknown,
					revision: 3,
					state: "confirmed",
					exitReceipt: {
						attemptId: crypto.randomUUID(),
						receiptId: "exit-1",
						exitedAt: now.toISOString(),
						confirmedAt: now.toISOString(),
					},
				},
			}),
		),
	).rejects.toThrow("stop_conflict");
	expect((await db.transaction((tx) => readProjectionFacts(tx, { executionId: ids.execution }))).stops).toEqual([
		unknown,
	]);
});
test("keeps first launch deadline and accepts user budgets above former limits", async () => {
	({ db } = await receiptFixture());
	const budgetMs = 1000000000;
	const initial = {
		deadlineId: "deadline-1",
		groupOccurrenceKey: "group",
		budgetMs,
		launchedAt: null,
		deadlineAt: null,
		launchReceiptId: null,
	};
	await db.transaction((tx) => recordDeadline(tx, { executionId: ids.execution, deadline: initial }));
	const observed = {
		...initial,
		launchedAt: now.toISOString(),
		deadlineAt: new Date(now.getTime() + budgetMs).toISOString(),
		launchReceiptId: "launch-1",
	};
	await db.transaction((tx) => recordDeadline(tx, { executionId: ids.execution, deadline: observed }));
	expect(
		await db.transaction((tx) =>
			recordDeadline(tx, {
				executionId: ids.execution,
				deadline: {
					...observed,
					launchedAt: "2026-09-30T06:00:00Z",
					deadlineAt: new Date(now.getTime() + budgetMs + 60000).toISOString(),
					launchReceiptId: "later",
				},
			}),
		),
	).toEqual(observed);
});
