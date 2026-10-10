import type { AgentRun, FlowExecutionRecord } from "@trellis/api";
import { buildFlowRunRows } from "../../../features/reviews/FlowRuns/components/FlowRun/buildFlowRunRows";
import { flowDoc, flowResponses } from "./flow";
import { actor, id, project, ticket, timestamp } from "./project";
import { pullRequest, reviewResponses, reviewStatus } from "./review";
import { run } from "./session";

const startedAt = Date.parse(timestamp);
const emptyExecution: FlowExecutionRecord = {
	id: id(560),
	flowId: flowDoc.flow.id,
	ticketId: ticket.id,
	projectId: project.id,
	diffId: pullRequest.id,
	headSha: reviewStatus.headRefOid,
	revision: 1,
	doc: flowDoc,
	tasks: [],
	createdAt: timestamp,
	updatedAt: timestamp,
	state: {
		version: 1,
		flowId: flowDoc.flow.id,
		flowVersion: flowDoc.flow.version,
		status: "waiting",
		startedAt,
		updatedAt: startedAt,
		error: null,
		steps: [],
	},
};
const rowKeys = buildFlowRunRows(emptyExecution).map((row) => row.key);
export const reviewStepKey = `${rowKeys[0]!}:step:1`;
export const decisionStepKey = `${rowKeys[2]!}:step:1`;
export const retainedReviewOutput = "The interface checks pass. Layout and keyboard evidence remains available.";
export const originalAttemptId = "storybook-flow-attempt-1";
export const replacementAttemptId = "storybook-flow-attempt-2";
export const flowTaskRun: AgentRun = {
	...run,
	id: id(561),
	name: "Review the interface",
	kind: "flow",
	ticketId: ticket.id,
	ticketIdentifier: ticket.identifier,
	ticketTitle: ticket.title,
	terminalId: originalAttemptId,
	sessionId: "storybook-flow-review",
	state: "running",
	processStatus: "running",
	pinnedAt: null,
};
export const replacementFlowTaskRun = { ...flowTaskRun, terminalId: replacementAttemptId };
export const flowExecution: FlowExecutionRecord = {
	...emptyExecution,
	tasks: [
		{ key: reviewStepKey, runId: flowTaskRun.id, attemptId: originalAttemptId, resultId: "storybook-flow-result-1" },
	],
	state: {
		...emptyExecution.state,
		steps: flowDoc.nodes.map((node, index) => ({
			key: rowKeys[index]!,
			actionKey: `${rowKeys[index]!}:step:1`,
			nodeId: node.id,
			parentKey: null,
			iteration: 1,
			round: 1,
			state: node.kind === "human" ? "waiting_human" : "succeeded",
			phase: "step",
			output: node.kind === "agent" ? retainedReviewOutput : null,
			decision: node.kind === "gate" ? "yes" : null,
			error: null,
			startedAt,
			endedAt: node.kind === "human" ? null : startedAt + 1000,
			deadlineAt: null,
			needsStop: false,
		})),
	},
};
export const flowHistoryResponses = {
	...flowResponses,
	...reviewResponses,
	"reviews.status": {
		...reviewStatus,
		prRow: { ...pullRequest, source: "manual", linkedBy: actor, linkedAt: timestamp },
	},
	"agentRuns.list": { items: [flowTaskRun], nextCursor: null },
	"agentRuns.seen": { id: flowTaskRun.id },
	"flowExecutions.list": [flowExecution],
};
