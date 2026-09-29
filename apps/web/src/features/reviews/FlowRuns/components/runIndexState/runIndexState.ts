import { type FlowExecutionIdentityV1, flowRunIsLive } from "@trellis/api";

export function runIndexState(records: readonly FlowExecutionIdentityV1[]) {
	return {
		pendingFlowIds: [...new Set(records.filter((record) => record.pendingSubmission).map((record) => record.flowId))],
		activeFlowIds: new Set(
			records.filter((record) => record.status === null || flowRunIsLive(record.status)).map((record) => record.flowId),
		),
	};
}
