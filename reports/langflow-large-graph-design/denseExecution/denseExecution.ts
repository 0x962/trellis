import { createHash } from "node:crypto";
import type { FlowDecisionDeliveryV1, FlowExecutionViewV1, FlowOccurrenceV1 } from "@trellis/api";
import { executionViewV1Example, flowV1Digest, flowV1Time } from "@trellis/api";
import { createDenseGraphFixture, type DenseGraphCase } from "../denseGraph";

const digestOf = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createDenseExecutionFixture(dimensions: DenseGraphCase) {
	const fixture = createDenseGraphFixture(dimensions);
	const ids = fixture.identities;
	const occurrences: FlowOccurrenceV1[] = [];
	const selectedRound = 37;

	for (let round = 1; round <= dimensions.roundCount; round += 1) {
		const outerPath = [{ loopNodeId: ids.outerLoop, round }];
		const iterationPath = [...outerPath, { loopNodeId: ids.innerLoop, round: 2 }];
		const prefix = `${ids.outerLoop}:${round}:${ids.innerLoop}:2`;
		const outerKey = `${ids.outerLoop}:${round}:children`;
		const innerKey = `${prefix}:children`;
		const reviewKey = `${prefix}:${ids.reviewGroup}:children`;
		const branchKey = `${prefix}:${ids.branchGroup}:children`;
		const baseState = round < selectedRound ? "succeeded" : round === selectedRound ? "running" : "pending";
		const base = {
			iterationPath,
			instruction: "Read this occurrence and retain its full loop path.",
			state: baseState,
			waitReason: null,
			output: null,
			decision: null,
			error: null,
			skipReason: null,
			startedAt: round <= selectedRound ? flowV1Time : null,
			endedAt: round < selectedRound ? flowV1Time : null,
			deadlineRefs: [],
			attempts: [],
		} satisfies Partial<FlowOccurrenceV1>;
		const group = (nodeId: string, occurrenceKey: string, parentOccurrenceKey: string | null, title: string) =>
			({
				...base,
				nodeId,
				occurrenceKey,
				parentOccurrenceKey,
				phase: "children",
				title,
				actionKey: `${occurrenceKey}:action`,
			}) satisfies FlowOccurrenceV1;
		occurrences.push(
			{ ...group(ids.outerLoop, outerKey, null, `Release round ${round}`), iterationPath: outerPath },
			group(ids.innerLoop, innerKey, outerKey, "Review round 2"),
			group(ids.reviewGroup, reviewKey, innerKey, "Review steps"),
			{
				...group(ids.branchGroup, branchKey, reviewKey, "Review branches"),
				state: round <= selectedRound ? "succeeded" : "pending",
				endedAt: round <= selectedRound ? flowV1Time : null,
			},
		);
		for (const [nodeId, title] of [
			[ids.correctness, "Correctness"],
			[ids.backend, "Backend"],
			[ids.human, "Release Decision"],
		] as const) {
			const occurrenceKey = `${prefix}:${nodeId}:step`;
			const activeHuman = round === selectedRound && nodeId === ids.human;
			const skipped = round === selectedRound && nodeId === ids.backend;
			const completedAgent = round === selectedRound && nodeId === ids.correctness;
			occurrences.push({
				...base,
				nodeId,
				occurrenceKey,
				parentOccurrenceKey: nodeId === ids.human ? reviewKey : branchKey,
				phase: "step",
				title,
				actionKey: `${occurrenceKey}:action`,
				state: activeHuman ? "waiting_human" : skipped ? "skipped" : completedAgent ? "succeeded" : baseState,
				waitReason: activeHuman ? "human" : null,
				skipReason: skipped ? "The gate excluded this branch. No agent starts for this occurrence." : null,
				endedAt: completedAgent || skipped ? flowV1Time : base.endedAt,
				attempts:
					nodeId === ids.correctness && round <= selectedRound
						? [1, 2].map((attempt) => ({
								stepId: `${occurrenceKey}:step`,
								agentRunId: String(1000 + round).padStart(26, "0"),
								attemptId: `attempt-${round}-${attempt}`,
								workspaceId: null,
								workspaceCommit: null,
								providerSessionId: null,
								state: "exited" as const,
								launchedAt: flowV1Time,
								resultId: `result-${round}-${attempt}`,
							}))
						: [],
			});
		}
	}

	const documentHash = digestOf(fixture.graph);
	const execution: FlowExecutionViewV1 = {
		...structuredClone(executionViewV1Example),
		status: "waiting",
		detail: "waiting_human",
		snapshot: {
			...structuredClone(executionViewV1Example.snapshot),
			engine: "langflow",
			graphDocument: fixture.graph,
			componentManifestHash: flowV1Digest,
			documentHash,
		},
		publication: { ...executionViewV1Example.publication!, componentManifestHash: flowV1Digest, documentHash },
		occurrences,
	};
	const selectedHuman = occurrences.find(
		(occurrence) => occurrence.nodeId === ids.human && occurrence.state === "waiting_human",
	)!;
	const deliveryBase = {
		decisionId: "dense-decision-37",
		payloadDigest: digestOf({ occurrenceKey: selectedHuman.occurrenceKey, approved: true }),
		engineRequestId: "dense-human-request-37",
		actionKey: selectedHuman.actionKey,
		occurrenceKey: selectedHuman.occurrenceKey,
		actor: { kind: "human" as const, name: "fixture-reviewer" },
		approved: true,
		output: "Retain this answer until the matching engine receipt arrives.",
		expectedRevision: execution.revision,
		recordedAt: flowV1Time,
	};
	const decisionDeliverySequence: FlowDecisionDeliveryV1[] = [
		...["recorded", "pending", "unknown"].map((state) => ({
			...deliveryBase,
			state: state as "recorded" | "pending" | "unknown",
			acceptedReceiptId: null,
			confirmedAt: null,
		})),
		{ ...deliveryBase, state: "confirmed", acceptedReceiptId: "dense-receipt-37", confirmedAt: flowV1Time },
	];
	const progressUpdate: FlowExecutionViewV1 = {
		...structuredClone(execution),
		revision: execution.revision + 1,
		lastEventSeq: execution.lastEventSeq + 1,
		occurrences: execution.occurrences.map((occurrence) =>
			occurrence.nodeId === ids.correctness && occurrence.iterationPath[0]!.round === 36
				? { ...occurrence, output: "The retained result has more detail." }
				: structuredClone(occurrence),
		),
	};

	return {
		...fixture,
		execution,
		progressUpdate,
		decisionDeliverySequence,
		terminalTarget: {
			executionId: execution.id,
			occurrenceKey: `${ids.outerLoop}:37:${ids.innerLoop}:2:${ids.correctness}:step`,
			agentRunId: String(1037).padStart(26, "0"),
			attemptId: "attempt-37-2",
		},
		selectedHumanKey: selectedHuman.occurrenceKey,
	};
}
