import { StatusAgentConfigSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { type ServiceCtx, SYSTEM_ACTOR } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { getRun } from "../agentRuns/queries.ts";
import { reserve } from "../agentRuns/reserve.ts";
import { type ColumnState, columnStates } from "./columnState.ts";

export async function reserveColumnWorker(
	ctx: ServiceCtx,
	tx: Tx,
	expected: ColumnState,
	expectedTerminalId?: string | null,
	previousWorkspaceExists = true,
) {
	await tx.execute(sql`SELECT id FROM tickets WHERE id=${expected.ticketId} FOR UPDATE`);
	const [current] = await columnStates(tx, expected.ticketId);
	if (
		!current?.allowed ||
		!current.agentConfig ||
		current.category === "done" ||
		current.category === "canceled" ||
		current.statusId !== expected.statusId ||
		current.runId !== expected.runId
	)
		return null;
	const config = StatusAgentConfigSchema.parse(current.agentConfig);
	const previous = current.runId ? await getRun(tx, current.runId) : null;
	if (previous && previous.terminalId !== expectedTerminalId) return null;
	if (previous) await tx.execute(sql`UPDATE agent_runs SET closed_at=${ctx.now} WHERE id=${previous.id}`);
	const claim = await reserve(
		{ ...ctx, actor: SYSTEM_ACTOR },
		tx,
		{
			ticket: current.ticketId,
			personaId: config.personaId,
			harness: config.harness,
			accountId: config.accountId ?? undefined,
			requestId: `column:${current.ticketId}:${previous?.terminalId ?? previous?.id ?? "initial"}:${current.statusId}`,
		},
		[],
		{ column: true },
	);
	if (claim.replay) return null;
	if (previous?.workspaceId && previousWorkspaceExists) {
		claim.run.workspaceId = previous.workspaceId;
		await tx.execute(sql`UPDATE agent_runs SET workspace_id=${previous.workspaceId} WHERE id=${claim.run.id}`);
	}
	await tx.execute(sql`INSERT INTO column_workers (ticket_id,status_id,run_id) VALUES (${current.ticketId},${current.statusId},${claim.run.id})
		ON CONFLICT (ticket_id) DO UPDATE SET status_id=EXCLUDED.status_id,run_id=EXCLUDED.run_id,retired=false,heartbeat_at=NULL`);
	return { ...claim, previous, requiredStatusId: current.statusId, requiredAgentConfig: current.agentConfig };
}
