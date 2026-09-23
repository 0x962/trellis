import type { FlowExecutionRecord } from "@trellis/api";
import { sql } from "drizzle-orm";
import { taskKey } from "../../agents/nativeFlow/taskKey.ts";
import type { ServiceCtx } from "../../context.ts";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import type { StoredExecution } from "./types.ts";

const normalizeDoc = (doc: FlowExecutionRecord["doc"]) => ({
	...doc,
	flow: { ...doc.flow, harness: doc.flow.harness ?? null },
	nodes: doc.nodes.map((node) => ({ ...node, harness: node.harness ?? null })),
});

export const readExecution = async (tx: Tx, id: string, lock = false) => {
	const [row] = await rows<StoredExecution>(
		tx,
		sql`SELECT * FROM flow_executions WHERE id=${id} ${lock ? sql`FOR UPDATE` : sql``}`,
	);
	if (!row) throw fail("NOT_FOUND", { kind: "flow execution", ref: id });
	return { ...row, doc: normalizeDoc(row.doc) };
};
export const get = async (_ctx: ServiceCtx, tx: Tx, input: { id: string }): Promise<FlowExecutionRecord> => {
	const [record] = await rows<Omit<FlowExecutionRecord, "tasks">>(
		tx,
		sql`SELECT id,flow_id AS "flowId",ticket_id AS "ticketId",project_id AS "projectId",revision,head_sha AS "headSha",doc,state,${iso(sql`created_at`)} AS "createdAt",${iso(sql`updated_at`)} AS "updatedAt" FROM flow_executions WHERE id=${input.id}`,
	);
	if (!record) throw fail("NOT_FOUND", { kind: "flow execution", ref: input.id });
	const tasks = await rows<FlowExecutionRecord["tasks"][number]>(
		tx,
		sql`SELECT key,run_id AS "runId",attempt_id AS "attemptId",result_id AS "resultId" FROM flow_execution_tasks WHERE execution_id=${input.id} ORDER BY created_at,key`,
	);
	return {
		...record,
		doc: normalizeDoc(record.doc),
		// A step stored before `endedAt` existed has no such key.
		state: {
			...record.state,
			steps: record.state.steps.map((step) => ({ ...step, endedAt: step.endedAt ?? null, actionKey: taskKey(step) })),
		},
		tasks,
	};
};
