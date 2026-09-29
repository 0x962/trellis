import type { FlowExecutionViewV1 } from "@trellis/api";

const details: Record<FlowExecutionViewV1["detail"], string> = {
	queued: "Queued for engine admission.",
	active: "The run is active.",
	waiting_human: "The run needs a human decision.",
	waiting_native: "The run awaits a native result.",
	unknown: "The run state is unknown.",
	completed: "The run is complete. Review readiness has separate checks.",
	failed: "The run failed.",
	canceled: "The run is canceled.",
};

export function executionViewNotice(execution: FlowExecutionViewV1, currentHead: string, readOnly: boolean): string {
	const parts = [details[execution.detail]];
	if (execution.failureKind === "feedback") parts.push("The result contains review feedback.");
	if (execution.error !== null) parts.push(execution.error);
	if (readOnly) parts.push("This history is read-only.");
	if (execution.diffId == null) parts.push("Diff association unknown.");
	if (execution.reviewedHead === null) parts.push("Reviewed commit unknown.");
	else if (execution.reviewedHead !== currentHead)
		parts.push(`This run reviewed another commit: ${execution.reviewedHead}.`);
	if (execution.submission?.ownership === "unknown") parts.push("Recovery awaits confirmed engine ownership.");
	if (execution.submission?.admission === "closed") parts.push("Native admission is closed.");
	if (execution.submission?.error) parts.push(execution.submission.error);
	if (execution.publication !== null) parts.push(`Publication ${execution.publication.publicationId}.`);
	const stops = execution.stopObligations.filter((stop) => stop.state !== "confirmed").length;
	if (stops > 0) parts.push(`${stops} worker stops await confirmation.`);
	return parts.join(" ");
}
