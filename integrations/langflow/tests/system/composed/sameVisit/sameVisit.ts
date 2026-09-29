import type { FlowOccurrenceIdentityV1 } from "@trellis/api";

type Visit = Pick<FlowOccurrenceIdentityV1, "nodeId" | "phase" | "iterationPath">;

export function sameVisit(left: Visit, right: Visit) {
	return (
		left.nodeId === right.nodeId &&
		left.phase === right.phase &&
		JSON.stringify(left.iterationPath) === JSON.stringify(right.iterationPath)
	);
}
