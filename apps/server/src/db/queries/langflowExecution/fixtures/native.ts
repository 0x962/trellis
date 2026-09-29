import type { NativeHandleV1, NativeRequestV1 } from "../../../../langflowContracts";
import { admission, ids, jobId } from "./fixture";
export const handle: NativeHandleV1 = {
	version: 1,
	stepId: "step-1",
	agentRunId: ids.agentRun,
	attemptId: "00000000-0000-4000-8000-000000000002",
	workspaceId: null,
	providerSessionId: null,
	state: "reserved",
	revision: 1,
};
export const nativeRequest: NativeRequestV1 = {
	version: 1,
	executionId: ids.execution,
	publicationId: ids.publication,
	engineJobId: jobId,
	engineEpoch: 1,
	nodeId: ids.node,
	occurrenceKey: "outer.501.review",
	parentOccurrenceKey: "outer.501",
	phase: "step",
	iterationPath: [{ loopNodeId: "outer", round: 501 }],
	admissionReceipt: admission,
	requestId: "00000000-0000-4000-8000-000000000004",
	specHash: "a".repeat(64),
	inputReceiptIds: [],
	groupDeadlineRefs: [],
	deadlineAt: null,
};
