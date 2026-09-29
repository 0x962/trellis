import type { FlowExecutionRecord } from "@trellis/api";
import type { FlowRunRowData } from "../buildFlowRunRows";

// The header retains unresolved stops and unknown associations even after the execution reaches a final state.
export function flowRunNotice(
	execution: FlowExecutionRecord,
	rows: readonly FlowRunRowData[],
	currentHead?: string,
): string | null {
	const { status, error } = execution.state;
	const notices: string[] = [];
	if (execution.diffId == null) notices.push("Diff association unknown.");
	if (execution.headSha === null) notices.push("Reviewed commit unknown.");
	else if (currentHead !== undefined && execution.headSha !== currentHead)
		notices.push(`This run reviewed another commit: ${execution.headSha}.`);
	const stops = execution.state.steps.filter((step) => step.needsStop).length;
	if (stops > 0) notices.push(`${stops} worker stops await confirmation.`);
	if (status === "failed") {
		const failed = rows.find((row) => row.state === "failed" && row.error !== null);
		const reason = execution.state.failureKind === "feedback" ? "Feedback" : "Failed";
		notices.push(failed ? `${reason} at ${failed.title}` : `${reason}: ${error ?? "No recorded error"}`);
	}
	if (status === "waiting") {
		const waiting = rows.find((row) => row.state === "waiting_human");
		if (waiting) notices.push(`Needs your decision: ${waiting.title}`);
		const unknown = rows.find((row) => row.state === "unknown");
		if (unknown) notices.push(`Needs attention: ${unknown.title}`);
	}
	if (status === "canceled" && error !== null) notices.push(error);
	return notices.length === 0 ? null : notices.join(" ");
}
