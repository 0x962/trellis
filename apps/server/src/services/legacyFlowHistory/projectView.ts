import { createHash } from "node:crypto";
import type { FlowExecutionRecord, FlowExecutionViewV1, FlowOccurrenceV1 } from "@trellis/api";
import { failureKind } from "./failureKind.ts";
import { occurrences } from "./occurrences.ts";

export const projectView = (record: FlowExecutionRecord, sourceDocument: string): FlowExecutionViewV1 => {
	const { doc, state, tasks: _tasks, headSha, ...identity } = record;
	const projected = occurrences(record);
	const diagnostics: FlowExecutionViewV1["snapshot"]["diagnostics"] = [];
	for (const [index, step] of state.steps.entries()) {
		if (step.needsStop)
			diagnostics.push({
				code: "LEGACY_STOP_TIME_UNKNOWN",
				message: "This occurrence requires a stop. The legacy record retains needsStop but has no stop request time.",
				severity: "warning",
				path: ["state", "steps", index, "needsStop"],
			});
		if (step.deadlineAt != null)
			diagnostics.push({
				code: "LEGACY_DEADLINE_START_UNKNOWN",
				message: `The legacy deadline is ${new Date(step.deadlineAt).toISOString()}. The record has no separate first-launch receipt.`,
				severity: "warning",
				path: ["state", "steps", index, "deadlineAt"],
			});
	}
	return {
		...identity,
		schemaVersion: 1,
		engine: "legacy",
		reviewedHead: headSha,
		snapshot: {
			schemaVersion: 1,
			engine: "legacy",
			flow: doc.flow,
			revision: doc.flow.version,
			documentHash: createHash("sha256").update(sourceDocument).digest("hex"),
			graphDocument: { nodes: doc.nodes, edges: doc.edges },
			componentManifestHash: null,
			diagnostics,
		},
		publication: null,
		submission: null,
		status: state.status,
		detail: detail(state.status, projected),
		failureKind: failureKind(state, doc) ?? null,
		error: state.error,
		lastEventSeq: 0,
		occurrences: projected,
		deadlines: [],
		stopObligations: [],
		decisionDeliveries: [],
	};
};

const detail = (
	status: FlowExecutionRecord["state"]["status"],
	steps: FlowOccurrenceV1[],
): FlowExecutionViewV1["detail"] => {
	if (status === "succeeded") return "completed";
	if (status === "failed" || status === "canceled") return status;
	if (steps.some((step) => step.state === "unknown")) return "unknown";
	if (steps.some((step) => step.state === "waiting_human")) return "waiting_human";
	return "active";
};
