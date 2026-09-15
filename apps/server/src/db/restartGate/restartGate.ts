import { restartPending } from "@trellis/runtime-protocol/restart-plan";

const blocked = new Set([
	"agentRuns.start",
	"agentRuns.refresh",
	"flowExecutions.start",
	"flowExecutions.reconcile",
	"controller.collect",
	"controller.claim",
	"controller.dispatch",
	"reviews.deliverPending",
]);

export function restartBlocks(home: string, service: string): boolean {
	return blocked.has(service) && restartPending(home);
}
