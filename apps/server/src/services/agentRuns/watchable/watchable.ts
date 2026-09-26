import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../context.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { invalidInput } from "../../../errors.ts";

type WatchableInput = { projectId: string; id: string };
const eligible = (projectId: string) => sql`project_id = ${projectId} AND closed_at IS NULL
	AND runtime = 'native' AND kind <> 'flow'`;

export async function watchableAgent(_ctx: ServiceCtx, tx: Tx, input: WatchableInput) {
	const [agent] = await rows<{ id: string; name: string }>(
		tx,
		sql`SELECT id, name FROM agent_runs WHERE id = ${input.id} AND ${eligible(input.projectId)}`,
	);
	return agent ?? null;
}

export async function assertWatchable(ctx: ServiceCtx, tx: Tx, input: WatchableInput) {
	const agent = await watchableAgent(ctx, tx, input);
	if (agent === null) throw invalidInput("agentId", "Choose an assigned agent in this project.");
	return agent;
}

export async function watchableAgents(_ctx: ServiceCtx, tx: Tx, input: { projectId: string }) {
	return rows<{ id: string; name: string }>(
		tx,
		sql`SELECT id, name FROM agent_runs WHERE ${eligible(input.projectId)} ORDER BY created_at DESC, id DESC LIMIT 100`,
	);
}

export async function deliveryTarget(_ctx: ServiceCtx, tx: Tx, input: { id: string }) {
	const [target] = await rows<{ terminalId: string; sessionId: string | null }>(
		tx,
		sql`SELECT terminal_id AS "terminalId", session_id AS "sessionId" FROM agent_runs
		WHERE id = ${input.id} AND closed_at IS NULL AND terminal_id IS NOT NULL`,
	);
	return target ?? null;
}
