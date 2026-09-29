import type { FlowDocumentV1, FlowPublicationV1 } from "./flowDocumentV1.ts";
import type { FlowDecisionDeliveryV1, FlowExecutionViewV1, FlowOccurrenceV1 } from "./flowExecutionViewV1.ts";

export const flowV1FixtureIds = {
	flow: "00000000000000000000000001",
	publication: "00000000000000000000000002",
	previousPublication: "00000000000000000000000003",
	execution: "00000000000000000000000004",
	ticket: "00000000000000000000000005",
	project: "00000000000000000000000006",
	agentRun: "00000000000000000000000007",
	diff: "00000000000000000000000008",
	node: "00000000000000000000000009",
	edge: "00000000000000000000000010",
};
export const flowV1Time = "2026-09-29T06:00:00Z";
export const flowV1Digest = "a".repeat(64);
export const flowV1RequestId = "b9e9b394-f091-41da-96ca-591b678aac83";
const flow = {
	id: flowV1FixtureIds.flow,
	project: "TRL",
	slug: "review",
	name: "Review",
	description: "Review a proposed change.",
	briefing: "Read the ticket.",
	harness: null,
	version: 2,
	createdAt: flowV1Time,
	updatedAt: flowV1Time,
};
export const legacyDocumentV1Example: Extract<FlowDocumentV1, { engine: "legacy" }> = {
	schemaVersion: 1,
	engine: "legacy",
	flow,
	graphDocument: { nodes: [], edges: [] },
	componentManifestHash: null,
	revision: 2,
	documentHash: flowV1Digest,
	diagnostics: [],
	publication: { state: "not_requested", revision: 2 },
	lastExecutablePublication: null,
};
export const publicationV1Example: FlowPublicationV1 = {
	publicationId: flowV1FixtureIds.publication,
	flowId: flowV1FixtureIds.flow,
	revision: 2,
	documentHash: flowV1Digest,
	engineFlowId: "engine-flow-1",
	enginePackageDigest: "b".repeat(64),
	componentManifestHash: "c".repeat(64),
	publishedAt: flowV1Time,
	conversion: { converterVersion: "1", sourceDocumentHash: "d".repeat(64) },
};
export const pendingDocumentV1Example: Extract<FlowDocumentV1, { engine: "langflow" }> = {
	...legacyDocumentV1Example,
	engine: "langflow",
	graphDocument: { data: { nodes: [], edges: [] } },
	componentManifestHash: publicationV1Example.componentManifestHash,
	publication: { state: "pending", revision: 2 },
	lastExecutablePublication: {
		...publicationV1Example,
		publicationId: flowV1FixtureIds.previousPublication,
		revision: 1,
		documentHash: "e".repeat(64),
	},
};
export const publishedDocumentV1Example: Extract<FlowDocumentV1, { engine: "langflow" }> = {
	...pendingDocumentV1Example,
	publication: { state: "published", revision: 2, publication: publicationV1Example },
	lastExecutablePublication: publicationV1Example,
};
const {
	publication: _publication,
	lastExecutablePublication: _lastExecutable,
	...snapshot
} = publishedDocumentV1Example;
export const executionViewV1Example: FlowExecutionViewV1 = {
	id: flowV1FixtureIds.execution,
	flowId: flowV1FixtureIds.flow,
	ticketId: flowV1FixtureIds.ticket,
	projectId: flowV1FixtureIds.project,
	diffId: null,
	revision: 8,
	createdAt: flowV1Time,
	updatedAt: flowV1Time,
	schemaVersion: 1,
	engine: "langflow",
	reviewedHead: "f".repeat(40),
	snapshot,
	publication: publicationV1Example,
	submission: {
		requestId: flowV1RequestId,
		state: "submitted",
		admission: "open",
		engineJobId: "engine-job-1",
		engineEpoch: 1,
		ownership: "confirmed",
		error: null,
	},
	status: "running",
	detail: "active",
	failureKind: null,
	error: null,
	lastEventSeq: 5,
	occurrences: [],
	deadlines: [],
	stopObligations: [],
	decisionDeliveries: [],
};
export const occurrenceV1Example: FlowOccurrenceV1 = {
	kind: "agent",
	nodeId: "node-1",
	occurrenceKey: "loop-1:37:node-1:step",
	parentOccurrenceKey: "loop-1:37",
	phase: "step",
	iterationPath: [{ loopNodeId: "loop-1", round: 37 }],
	title: "Review",
	instruction: "Read the diff.",
	actionKey: "review-37",
	state: "unknown",
	waitReason: "ownership_unknown",
	output: null,
	outputSource: null,
	decision: null,
	error: null,
	skipReason: null,
	startedAt: null,
	endedAt: null,
	deadlineRefs: [],
	attempts: [
		{
			stepId: "step-37",
			agentRunId: flowV1FixtureIds.agentRun,
			attemptId: "attempt-37",
			workspaceId: null,
			workspaceCommit: null,
			providerSessionId: null,
			state: "unknown",
			launchedAt: null,
			resultId: null,
		},
	],
};
export const unknownAdmissionV1Example: FlowExecutionViewV1 = {
	...executionViewV1Example,
	status: "waiting",
	detail: "unknown",
	submission: {
		requestId: flowV1RequestId,
		state: "submission_unknown",
		admission: "closed",
		engineJobId: null,
		engineEpoch: 1,
		ownership: "unknown",
		error: "The engine response is unknown.",
	},
};
export const retainedOutputV1Example: FlowOccurrenceV1 = {
	...occurrenceV1Example,
	state: "succeeded",
	waitReason: null,
	output: "The retained result belongs to attempt 37.",
	outputSource: {
		stepId: "step-37",
		agentRunId: flowV1FixtureIds.agentRun,
		attemptId: "attempt-37",
		resultId: "result-37",
	},
	attempts: [
		{
			...occurrenceV1Example.attempts[0]!,
			state: "exited",
			resultId: "result-37",
		},
		{
			...occurrenceV1Example.attempts[0]!,
			attemptId: "attempt-38",
			state: "reserved",
		},
	],
};
const {
	publication: _legacyPublication,
	lastExecutablePublication: _legacyExecutable,
	...legacySnapshot
} = legacyDocumentV1Example;
export const legacyExecutionViewV1Example: FlowExecutionViewV1 = {
	...executionViewV1Example,
	engine: "legacy",
	snapshot: legacySnapshot,
	publication: null,
	submission: null,
	occurrences: [
		{
			...occurrenceV1Example,
			kind: null,
			output: "Historical output with no retained native result binding.",
			outputSource: null,
			attempts: [],
		},
	],
};
export const stopPendingV1Example: FlowExecutionViewV1 = {
	...executionViewV1Example,
	status: "canceled",
	detail: "canceled",
	occurrences: [occurrenceV1Example],
	stopObligations: [
		{
			stepId: "step-37",
			agentRunId: flowV1FixtureIds.agentRun,
			attemptId: "attempt-37",
			reason: "The person canceled the execution.",
			requestedAt: flowV1Time,
			state: "pending",
			confirmedAt: null,
		},
	],
};
export const unknownDecisionV1Example: FlowDecisionDeliveryV1 = {
	decisionId: "decision-37",
	payloadDigest: flowV1Digest,
	engineRequestId: "human-request-37",
	actionKey: "review-37",
	occurrenceKey: occurrenceV1Example.occurrenceKey,
	actor: { kind: "human", name: "reviewer" },
	approved: true,
	output: "Keep the notes until the engine confirms the decision.",
	expectedRevision: 7,
	recordedAt: flowV1Time,
	state: "unknown",
	acceptedReceiptId: null,
	confirmedAt: null,
};
