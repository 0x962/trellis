import { createHash } from "node:crypto";
import type { FlowExecutionRecord, FlowExecutionViewV1, FlowOccurrenceV1 } from "@trellis/api";
import { failureKind } from "./failureKind.ts";
import { occurrences } from "./occurrences.ts";

const time = (value: number) => new Date(value).toISOString();

export const projectView = (record: FlowExecutionRecord, sourceDocument: string): FlowExecutionViewV1 => {
	const { doc, state, tasks: _tasks, headSha, ...identity } = record;
	const nodes = new Map(doc.nodes.map((node) => [node.id, node]));
	const deadlines = state.steps.flatMap((step) => {
		const node = nodes.get(step.nodeId)!;
		if (step.deadlineAt === null || node.minutes === null) return [];
		return [
			{
				deadlineId: step.key,
				groupOccurrenceKey: step.key,
				launchedAt: time(step.deadlineAt - node.minutes * 60_000),
				deadlineAt: time(step.deadlineAt),
			},
		];
	});
	const projected = occurrences(record, new Set(deadlines.map((deadline) => deadline.deadlineId)));
	const diagnostics = state.steps.flatMap((step, index) =>
		step.needsStop
			? [
					{
						code: "LEGACY_STOP_TIME_UNKNOWN",
						message:
							"This occurrence requires a stop. The legacy record retains needsStop but has no stop request time.",
						severity: "warning" as const,
						path: ["state", "steps", index, "needsStop"],
					},
				]
			: [],
	);
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
		deadlines,
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
