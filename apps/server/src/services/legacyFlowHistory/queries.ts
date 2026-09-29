import type { FlowExecutionRecord } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { iso, rows, textArray } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import { actionKey } from "./actionKey.ts";
import { failureKind } from "./failureKind.ts";
import { normalizeDoc } from "./normalizeDoc.ts";

type StoredRecord = Omit<FlowExecutionRecord, "tasks">;
type StoredTask = FlowExecutionRecord["tasks"][number] & { executionId: string };

const recordsById = async (tx: Tx, ids: string[]) => {
	if (ids.length === 0) return new Map<string, FlowExecutionRecord>();
	const records = await rows<StoredRecord>(
		tx,
		sql`SELECT id,flow_id AS "flowId",ticket_id AS "ticketId",project_id AS "projectId",diff_id AS "diffId",request->>'repeatOf' AS "repeatOf",request->>'repeatReason' AS "repeatReason",revision,head_sha AS "headSha",doc,state,${iso(sql`created_at`)} AS "createdAt",${iso(sql`updated_at`)} AS "updatedAt" FROM flow_executions WHERE id=ANY(${textArray(ids)})`,
	);
	const tasks = await rows<StoredTask>(
		tx,
		sql`SELECT execution_id AS "executionId",key,run_id AS "runId",attempt_id AS "attemptId",result_id AS "resultId" FROM flow_execution_tasks WHERE execution_id=ANY(${textArray(ids)}) ORDER BY execution_id,created_at,key`,
	);
	const tasksByExecution = new Map<string, StoredTask[]>();
	for (const task of tasks) {
		const executionTasks = tasksByExecution.get(task.executionId) ?? [];
		executionTasks.push(task);
		tasksByExecution.set(task.executionId, executionTasks);
	}
	return new Map(
		records.map((record) => [
			record.id,
			{
				...record,
				doc: normalizeDoc(record.doc),
				state: {
					...record.state,
					failureKind: failureKind(record.state, record.doc),
					steps: record.state.steps.map((step) => ({
						...step,
						startedAt: step.startedAt ?? null,
						endedAt: step.endedAt ?? null,
						deadlineAt: step.deadlineAt ?? null,
						actionKey: actionKey(step),
					})),
				},
				tasks: (tasksByExecution.get(record.id) ?? []).map(({ executionId: _, ...task }) => task),
			},
		]),
	);
};

export const getMany = async (_ctx: ServiceCtx, tx: Tx, ids: string[]): Promise<FlowExecutionRecord[]> => {
	const byId = await recordsById(tx, ids);
	return ids.flatMap((id) => {
		const record = byId.get(id);
		return record === undefined ? [] : [record];
	});
};

export const get = async (ctx: ServiceCtx, tx: Tx, input: { id: string }): Promise<FlowExecutionRecord> => {
	const [record] = await getMany(ctx, tx, [input.id]);
	if (record === undefined) throw fail("NOT_FOUND", { kind: "flow execution", ref: input.id });
	return record;
};
