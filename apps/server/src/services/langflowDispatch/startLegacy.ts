import type { FlowExecutionStartInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../context.ts";
import { readExecution } from "../../db/queries/langflowExecution";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { assertLegacy } from "../flowDocuments/assertLegacy";
import { unsupported } from "../flowDocuments/assertLegacy/components/unsupported";
import { start } from "../flowExecutions/start.ts";
import { resolveFlow } from "../flows/queries.ts";

export async function startLegacy(ctx: ServiceCtx, tx: Tx, input: FlowExecutionStartInput) {
	const actor = requireActor(ctx);
	const [previous] = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM flow_executions
		WHERE actor_kind=${actor.kind} AND actor_name=${actor.name} AND request_id=${input.requestId}`,
	);
	if (previous) return start(ctx, tx, input);
	const [replacement] = await rows<{ id: string }>(
		tx,
		sql`SELECT execution_id AS id FROM langflow_executions
		WHERE actor_kind=${actor.kind} AND actor_name=${actor.name} AND request_id=${input.requestId}`,
	);
	if (replacement) {
		const execution = await readExecution(tx, { executionId: replacement.id });
		throw unsupported(execution!.snapshot, "write");
	}
	const flow = await resolveFlow(tx, input.flow);
	await tx.execute(sql`SELECT id FROM flows WHERE id=${flow.id} FOR UPDATE`);
	await assertLegacy(ctx, tx, { flowId: flow.id, operation: "write" });
	return start(ctx, tx, input);
}
