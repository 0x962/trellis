import type { FlowStep } from "../../../../apps/server/src/agents/nativeFlow/types.ts";
import type { NativeRequestV1 } from "../../../../apps/server/src/langflowContracts/index.ts";
import { NativeRequestV1Schema, protocolDigest } from "../../../../apps/server/src/langflowContracts/index.ts";
import { nativeRequest } from "./contractFixtures.ts";

const reference = (kind: string, value: unknown) => `${kind}:${protocolDigest(JSON.stringify(value))}`;

const iterationPath = (steps: FlowStep[], step: FlowStep) => {
	const path: NativeRequestV1["iterationPath"] = [];
	let child = step;
	while (child.parentKey !== null) {
		const parent = steps.find((candidate) => candidate.key === child.parentKey)!;
		path.unshift({ loopNodeId: parent.nodeId, round: child.iteration });
		child = parent;
	}
	return path;
};

export function nativeRequestForStep(executionId: string, steps: FlowStep[], step: FlowStep) {
	const path = iterationPath(steps, step);
	const parentOccurrenceKey =
		step.parentKey === null ? null : reference("occurrence", { executionId, taskKey: step.parentKey });
	const semantic = {
		executionId,
		nodeId: step.nodeId,
		parentOccurrenceKey,
		phase: step.phase,
		iterationPath: path,
	};
	return NativeRequestV1Schema.parse({
		...nativeRequest(executionId),
		nodeId: step.nodeId,
		occurrenceKey: reference("occurrence", semantic),
		parentOccurrenceKey,
		phase: step.phase,
		iterationPath: path,
		requestId: crypto.randomUUID(),
		inputReceiptIds: [],
		groupDeadlineRefs: path.map((item) => reference("deadline", { executionId, ...item })),
		deadlineAt: null,
	});
}
