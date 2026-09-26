import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../context.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";

export async function watchableAgents(_ctx: ServiceCtx, tx: Tx, input: { projectId: string; id?: string }) {
	const exact = input.id === undefined ? sql`` : sql`AND id = ${input.id}`;
	return rows<{ id: string; name: string }>(
		tx,
		sql`SELECT id, name FROM agent_runs WHERE project_id = ${input.projectId} AND closed_at IS NULL
		AND runtime = 'native' AND kind <> 'flow' ${exact} ORDER BY created_at DESC, id DESC LIMIT 100`,
	);
}
