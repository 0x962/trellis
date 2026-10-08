import type { FlowExecutionRecord } from "@trellis/api";
import { flowDoc, flowResponses } from "./flow";
import { actor, id, project, ticket, timestamp } from "./project";
import { pullRequest, reviewResponses, reviewStatus } from "./review";

const startedAt = Date.parse(timestamp);
export const flowExecution: FlowExecutionRecord = {
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
		flowVersion: 1,
		status: "waiting",
		startedAt,
		updatedAt: startedAt,
		error: null,
		steps: [
			{
				key: "interface-review",
				actionKey: "interface-review",
				nodeId: id(501),
				parentKey: null,
				iteration: 0,
				round: 0,
				state: "succeeded",
				phase: "step",
				output: "The interface checks pass.",
				decision: null,
				error: null,
				startedAt,
				endedAt: startedAt,
				deadlineAt: null,
				needsStop: false,
			},
			{
				key: "approve-review",
				actionKey: "approve-review",
				nodeId: id(503),
				parentKey: null,
				iteration: 0,
				round: 0,
				state: "waiting_human",
				phase: "step",
				output: null,
				decision: null,
				error: null,
				startedAt,
				endedAt: null,
				deadlineAt: null,
				needsStop: false,
			},
		],
	},
};
export const flowHistoryResponses = {
	...flowResponses,
	...reviewResponses,
	"reviews.status": {
		...reviewStatus,
		prRow: { ...pullRequest, source: "manual", linkedBy: actor, linkedAt: timestamp },
	},
	"flowExecutions.list": [flowExecution],
	"flowExecutions.cancel": { ...flowExecution, revision: 2, state: { ...flowExecution.state, status: "canceled" } },
	"flowExecutions.decide": { ...flowExecution, revision: 2, state: { ...flowExecution.state, status: "running" } },
};
