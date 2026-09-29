import { FlowExecutionViewV1Schema } from "@trellis/api";
import type { ServiceCtx } from "../../context.ts";
import { initializeProjection, lockExecution, readProjection } from "../../db/queries/langflowExecution";
import type { Tx } from "../../db/tx.ts";

export async function initialize(ctx: ServiceCtx, tx: Tx, input: { executionId: string }) {
	if (ctx.actor?.kind !== "system") throw new Error("authority_conflict");
	const execution = await lockExecution(tx, input);
	const stored = await readProjection(tx, input);
	if (stored) return stored.view;
	const unknown = execution.submission.state === "submission_unknown";
	const failed = execution.submission.state === "failed";
	const view = FlowExecutionViewV1Schema.parse({
		schemaVersion: 1,
		engine: "langflow",
		id: execution.executionId,
		flowId: execution.flowId,
		ticketId: execution.ticketId,
		projectId: execution.projectId,
		diffId: execution.diffId,
		reviewedHead: execution.reviewedHead,
		snapshot: execution.snapshot,
		publication: execution.publication,
		submission: {
			requestId: execution.submission.requestId,
			state: execution.submission.state,
			admission: execution.admission.state,
			engineJobId: execution.engineJobId,
			engineEpoch: execution.authority?.engineEpoch ?? 1,
			ownership: execution.authority === null ? "unknown" : "confirmed",
			error: null,
		},
		revision: 1,
		lastEventSeq: 0,
		createdAt: execution.createdAt.toISOString(),
		updatedAt: ctx.now.toISOString(),
		status: failed ? "failed" : unknown ? "waiting" : "running",
		detail: failed ? "failed" : unknown ? "unknown" : "queued",
		failureKind: failed ? "error" : null,
		error: null,
		occurrences: [],
		decisionDeliveries: [],
		stopObligations: [],
		deadlines: [],
	});
	await initializeProjection(tx, { view });
	ctx.emit({ type: "flows.changed", id: view.flowId });
	return view;
}
