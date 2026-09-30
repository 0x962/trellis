import {
	executionViewV1Example,
	type FlowExecutionIdentityV1,
	type FlowExecutionViewV1,
	occurrenceV1Example,
	retainedOutputV1Example,
} from "@trellis/api";
import { flowResponses } from "./flow";
import { actor, project, ticket, timestamp } from "./project";
import { pullRequest, reviewResponses, reviewStatus } from "./review";

const flowExecution: FlowExecutionViewV1 = {
	...executionViewV1Example,
	ticketId: ticket.id,
	projectId: project.id,
	diffId: pullRequest.id,
	reviewedHead: reviewStatus.headRefOid,
	status: "waiting",
	detail: "waiting_human",
	createdAt: timestamp,
	updatedAt: timestamp,
	occurrences: [
		{
			...retainedOutputV1Example,
			occurrenceKey: "interface-review",
			parentOccurrenceKey: null,
			iterationPath: [],
			title: "Review the interface",
			startedAt: timestamp,
			endedAt: timestamp,
		},
		{
			...occurrenceV1Example,
			kind: "human",
			occurrenceKey: "approve-review",
			parentOccurrenceKey: null,
			iterationPath: [],
			title: "Approve the result",
			instruction: "Read the retained review result and approve the change.",
			actionKey: "approve-review",
			state: "waiting_human",
			waitReason: "human",
			attempts: [],
		},
	],
};

const history: FlowExecutionIdentityV1[] = [
	{
		id: flowExecution.id,
		engine: flowExecution.engine,
		flowId: flowExecution.flowId,
		status: flowExecution.status,
		pendingSubmission: false,
	},
];

export const flowHistoryResponses = {
	...flowResponses,
	...reviewResponses,
	"reviews.status": {
		...reviewStatus,
		prRow: { ...pullRequest, source: "manual", linkedBy: actor, linkedAt: timestamp },
	},
	"flowDocumentsV1.list": history,
	"flowDocumentsV1.view": flowExecution,
	"flowExecutionsV1.recovery": { state: "open" },
	"flowExecutionsV1.cancel": { ...flowExecution, revision: 9, status: "canceled", detail: "canceled" },
	"flowExecutionsV1.decision": { ...flowExecution, revision: 9, status: "succeeded", detail: "completed" },
};
