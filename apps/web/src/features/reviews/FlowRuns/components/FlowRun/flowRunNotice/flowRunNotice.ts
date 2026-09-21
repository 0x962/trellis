import type { FlowExecutionRecord } from "@trellis/api";
import type { FlowRunRowData } from "../buildFlowRunRows";

// The one line under a run header that says what to look at: the step that
// failed, the step that waits for a person or for attention, or the reason
// of a cancel. A running or finished run needs no line.
export function flowRunNotice(execution: FlowExecutionRecord, rows: readonly FlowRunRowData[]): string | null {
	const { status, error } = execution.state;
	if (status === "failed") {
		const failed = rows.find((row) => row.state === "failed" && row.error !== null);
		return failed ? `Failed at ${failed.title}` : `Failed: ${error}`;
	}
	if (status === "waiting") {
		const waiting = rows.find((row) => row.state === "waiting_human");
		if (waiting) return `Needs your decision: ${waiting.title}`;
		const unknown = rows.find((row) => row.state === "unknown");
		return unknown ? `Needs attention: ${unknown.title}` : null;
	}
	return status === "canceled" ? error : null;
}
