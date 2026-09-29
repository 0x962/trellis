import { sql } from "drizzle-orm";
import { rows } from "../../../../apps/server/src/db/queries/support.ts";
import type { Tx } from "../../../../apps/server/src/db/tx.ts";
import type { NativeRequestV1 } from "../../../../apps/server/src/langflowContracts/index.ts";
import { NativeRequestV1Schema, protocolDigest } from "../../../../apps/server/src/langflowContracts/index.ts";

export type BridgeReservationBinding = {
	stepId: string;
	executionId: string;
	taskKey: string;
	nodeId: string;
	parentKey: string | null;
	iteration: number;
	phase: string;
	round: number;
	agentRunId: string;
	attemptId: string;
	request: NativeRequestV1;
	requestBytes: string;
	requestDigest: string;
	semanticBytes: string;
};

type StoredBinding = {
	step_id: string;
	execution_id: string;
	task_key: string;
	node_id: string;
	parent_key: string | null;
	iteration: number;
	phase: string;
	round: number;
	agent_run_id: string;
	attempt_id: string;
	request_bytes: string;
	request_digest: string;
	semantic_bytes: string;
};

export type BridgeReservationInput = Omit<
	BridgeReservationBinding,
	"stepId" | "request" | "requestDigest" | "semanticBytes"
>;

const semanticBytes = (request: NativeRequestV1) =>
	JSON.stringify({
		nodeId: request.nodeId,
		parentOccurrenceKey: request.parentOccurrenceKey,
		phase: request.phase,
		iterationPath: request.iterationPath,
	});

const binding = (row: StoredBinding): BridgeReservationBinding => ({
	stepId: row.step_id,
	executionId: row.execution_id,
	taskKey: row.task_key,
	nodeId: row.node_id,
	parentKey: row.parent_key,
	iteration: row.iteration,
	phase: row.phase,
	round: row.round,
	agentRunId: row.agent_run_id,
	attemptId: row.attempt_id,
	request: NativeRequestV1Schema.parse(JSON.parse(row.request_bytes)),
	requestBytes: row.request_bytes,
	requestDigest: row.request_digest,
	semanticBytes: row.semantic_bytes,
});

export async function createBridgeReservationStore(tx: Tx) {
	await tx.execute(sql`
		CREATE TABLE langflow_native_reservations_fixture (
			step_id text PRIMARY KEY,
			execution_id text NOT NULL,
			task_key text NOT NULL,
			node_id text NOT NULL,
			parent_key text,
			iteration integer NOT NULL,
			phase text NOT NULL,
			round integer NOT NULL,
			agent_run_id text NOT NULL,
			attempt_id text NOT NULL UNIQUE,
			request_id text NOT NULL,
			request_bytes text NOT NULL,
			request_digest text NOT NULL,
			semantic_bytes text NOT NULL,
			semantic_digest text NOT NULL,
			UNIQUE (execution_id, task_key),
			UNIQUE (execution_id, request_id),
			UNIQUE (execution_id, semantic_digest)
		)
	`);
}

export async function reserveBridgeStep(tx: Tx, input: BridgeReservationInput) {
	const request = NativeRequestV1Schema.parse(JSON.parse(input.requestBytes));
	const requestDigest = protocolDigest(input.requestBytes);
	const semantic = semanticBytes(request);
	const semanticDigest = protocolDigest(semantic);
	const found = await rows<StoredBinding>(
		tx,
		sql`
		SELECT step_id,execution_id,task_key,node_id,parent_key,iteration,phase,round,
			agent_run_id,attempt_id,request_bytes,request_digest,semantic_bytes
		FROM langflow_native_reservations_fixture
		WHERE execution_id=${input.executionId}
			AND (task_key=${input.taskKey} OR request_id=${request.requestId} OR semantic_digest=${semanticDigest})
		FOR UPDATE
	`,
	);
	if (found.length > 0) {
		const saved = binding(found[0]!);
		if (
			saved.executionId !== input.executionId ||
			saved.taskKey !== input.taskKey ||
			saved.nodeId !== input.nodeId ||
			saved.parentKey !== input.parentKey ||
			saved.iteration !== input.iteration ||
			saved.phase !== input.phase ||
			saved.round !== input.round ||
			saved.agentRunId !== input.agentRunId ||
			saved.attemptId !== input.attemptId ||
			saved.requestBytes !== input.requestBytes ||
			saved.requestDigest !== requestDigest ||
			saved.semanticBytes !== semantic
		)
			throw new Error("bridge_reservation_conflict");
		return saved;
	}
	const stepId = crypto.randomUUID();
	await tx.execute(sql`
		INSERT INTO langflow_native_reservations_fixture (
			step_id,execution_id,task_key,node_id,parent_key,iteration,phase,round,
			agent_run_id,attempt_id,request_id,request_bytes,request_digest,semantic_bytes,semantic_digest
		) VALUES (
			${stepId},${input.executionId},${input.taskKey},${input.nodeId},${input.parentKey},${input.iteration},
			${input.phase},${input.round},${input.agentRunId},${input.attemptId},${request.requestId},
			${input.requestBytes},${requestDigest},${semantic},${semanticDigest}
		)
	`);
	return {
		stepId,
		...input,
		request,
		requestDigest,
		semanticBytes: semantic,
	};
}

export async function readBridgeStep(tx: Tx, executionId: string, taskKey: string) {
	const found = await rows<StoredBinding>(
		tx,
		sql`
		SELECT step_id,execution_id,task_key,node_id,parent_key,iteration,phase,round,
			agent_run_id,attempt_id,request_bytes,request_digest,semantic_bytes
		FROM langflow_native_reservations_fixture
		WHERE execution_id=${executionId} AND task_key=${taskKey}
	`,
	);
	return found.length === 0 ? null : binding(found[0]!);
}
