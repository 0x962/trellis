import { isDeepStrictEqual } from "node:util";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../context";
import { bindExecution } from "../../../db/queries/langflowExecution";
import { rows } from "../../../db/queries/support";
import type { Tx } from "../../../db/tx";
import { readCancellationReceipt } from "../../langflowStops";
import { databaseStore } from "../databaseStore";
import { restoreInitial } from "./components/restoreInitial";
import type { StartStateInput } from "./contracts";

export async function startState(ctx: ServiceCtx, tx: Tx, request: StartStateInput) {
	if (ctx.actor?.kind !== "system") throw new Error("langflow_internal_start_required");
	if (request.operation === "pending") {
		const pending = await rows<{ execution_id: string }>(tx, sql`
			SELECT e.execution_id FROM langflow_executions e
			WHERE e.host_id=${request.hostId} AND e.execution_id>${request.input.afterId}
			AND e.submission->>'state'<>'failed'
			AND (e.cancel_intent IS NULL OR e.correlation IS NULL)
			AND (e.admission->>'state'='closed' OR EXISTS (
				SELECT 1 FROM langflow_outbox o WHERE o.execution_id=e.execution_id
				AND o.kind='admission' AND o.id=e.admission->'receipt'->>'admissionId' AND o.receipt IS NULL
			)) ORDER BY e.execution_id LIMIT 100`);
		return pending.map((row) => row.execution_id);
	}
	const store = databaseStore(ctx);
	const execution = await store.readSubmission(tx, request.input);
	if (execution.hostId !== request.hostId) throw new Error("start_host_conflict");
	switch (request.operation) {
		case "read":
			return execution;
		case "markUnknown":
			return store.markUnknown(tx, request.input);
		case "bind":
			return store.bind(tx, request.input);
		case "bindCancellation": {
			if (!execution.canceled || execution.admission.state !== "closed" ||
				request.input.authority.permissions.length !== 1 || request.input.authority.permissions[0] !== "execution.cancel")
				throw new Error("cancellation_binding_conflict");
			await bindExecution(tx, request.input);
			return store.readSubmission(tx, request.input);
		}
		case "restoreInitial":
			await restoreInitial(tx, request.input);
			return store.readSubmission(tx, request.input);
		case "open":
			return store.openAdmission(tx, { ...request.input, now: ctx.now });
		case "confirm":
			await store.confirmAdmission(tx, request.input);
			return null;
		case "cancellationProof": {
			const proof = await readCancellationReceipt(ctx, tx, request.input);
			if (!proof.acknowledgement || proof.needsStop ||
				!["completed", "failed", "cancelled", "timed_out"].includes(proof.acknowledgement.engineStatus)) return null;
			return JSON.stringify(proof);
		}
		case "admissionBytes": {
			if (execution.admission.state !== "open") return null;
			const [record] = await rows<{ payload_bytes: string; receipt: unknown }>(tx, sql`
				SELECT payload_bytes,receipt FROM langflow_outbox WHERE execution_id=${execution.executionId}
				AND kind='admission' AND id=${execution.admission.receipt.admissionId}`);
			if (!record || !isDeepStrictEqual(JSON.parse(record.payload_bytes), execution.admission.receipt))
				throw new Error("admission_bytes_conflict");
			if (record.receipt !== null && !isDeepStrictEqual(record.receipt, execution.admission.receipt))
				throw new Error("admission_acknowledgement_conflict");
			return { payloadBytes: record.payload_bytes, confirmed: record.receipt !== null };
		}
	}
}
