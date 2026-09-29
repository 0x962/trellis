import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../../context.ts";
import * as queries from "../../../db/queries/langflowExecution";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { get } from "../../flowExecutions/queries.ts";
import { requestBytes } from "../requestBytes.ts";
import type { StartExecution, StartStore } from "../store.ts";

const executionOf = (row: NonNullable<Awaited<ReturnType<typeof queries.readExecution>>>): StartExecution => ({
	...row,
	engine: "langflow",
	canceled: row.cancelIntent !== null,
});

export function databaseStore(ctx: ServiceCtx): StartStore {
	const read: StartStore["read"] = async (tx, input) => {
		const row = await queries.readExecution(tx, input);
		return row
			? executionOf(row)
			: { engine: "legacy", executionId: input.executionId, record: await get(ctx, tx, { id: input.executionId }) };
	};
	return {
		read,
		readSubmission: async (tx, input) => executionOf(await queries.lockExecution(tx, input)),
		readRequest: async (tx, input) => {
			const receipt = await queries.readStartRequest(tx, input);
			if (receipt) return { ...receipt, ...input };
			const [legacy] = await rows<{ id: string; request: Parameters<typeof requestBytes>[0] & { repeatOf?: string } }>(
				tx,
				sql`SELECT id,request FROM flow_executions WHERE actor_kind=${input.actorKind} AND actor_name=${input.actorName} AND request_id=${input.requestId}`,
			);
			if (!legacy) return null;
			const { repeatOf: _repeatOf, ...request } = legacy.request;
			return { ...input, executionId: legacy.id, requestBytes: requestBytes(request) };
		},
		saveRequest: async (tx, input) => ({ ...(await queries.saveStartRequest(tx, input)), actorKind: input.actorKind }),
		latest: async (tx, input) => {
			const [latest] = await rows<{ id: string }>(
				tx,
				sql`
				SELECT id FROM (
					SELECT id,created_at FROM flow_executions WHERE flow_id=${input.flowId} AND diff_id=${input.diffId}
					UNION ALL
					SELECT execution_id AS id,created_at FROM langflow_executions WHERE flow_id=${input.flowId} AND diff_id=${input.diffId}
				) runs ORDER BY created_at DESC,id DESC LIMIT 1`,
			);
			if (!latest) return null;
			const execution = await read(tx, { executionId: latest.id });
			if (execution.engine === "legacy")
				return { execution, status: execution.record.state.status, failureKind: execution.record.state.failureKind };
			const projection = await queries.readProjection(tx, { executionId: latest.id });
			return {
				execution,
				status: projection?.view.status ?? null,
				failureKind: projection?.view.failureKind ?? null,
			};
		},
		reserve: async (tx, input) => {
			const { engine: _engine, canceled: _canceled, ...record } = input;
			return executionOf(
				await queries.reserveExecution(tx, { ...record, publicationRecordId: input.publicationId, revision: 1 }),
			);
		},
		markUnknown: async (tx, input) => {
			const row = await queries.lockExecution(tx, input);
			return executionOf(row.submission.state === "failed" ? row : await queries.markSubmissionUnknown(tx, input));
		},
		bind: async (tx, input) => {
			const row = await queries.lockExecution(tx, input);
			return executionOf(
				row.cancelIntent || row.submission.state === "failed" ? row : await queries.bindExecution(tx, input),
			);
		},
		openAdmission: async (tx, input) => open(tx, input),
		confirmAdmission: queries.confirmAdmission,
	};
}

async function open(tx: Tx, input: { executionId: string; now: Date }) {
	const row = await queries.lockExecution(tx, input);
	if (row.cancelIntent || row.submission.state === "failed" || row.admission.state === "open") return executionOf(row);
	const authority = row.authority!;
	queries.assertAuthority(row, authority, "native.reserve", input.now);
	return executionOf(
		await queries.openAdmission(tx, {
			executionId: row.executionId,
			correlation: row.correlation!,
			authority,
			receipt: {
				version: 1,
				executionId: row.executionId,
				publicationId: row.publicationId,
				engineJobId: row.correlation!.engineJobId,
				engineEpoch: authority.engineEpoch,
				admissionId: ulid(),
				submissionDigest: row.submission.submissionDigest,
				committedAt: input.now.toISOString(),
			},
		}),
	);
}
