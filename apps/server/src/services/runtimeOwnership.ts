import { sql } from "drizzle-orm";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { invalidInput } from "../errors.ts";

export const activeRuntimeOwners = (tx: Tx, projectId: string) =>
	rows<{ id: string; source: string; state: string }>(
		tx,
		sql`
		SELECT id, 'legacy' AS source, state FROM agent_sessions
		WHERE project_id = ${projectId} AND state NOT IN ('exited', 'stopped', 'failed')
		UNION ALL
		SELECT id, 'persona' AS source, state FROM agent_runs
		WHERE project_id = ${projectId} AND state IN ('starting', 'running', 'interrupted')
	`,
	);

export const assertRuntimeReleased = async (tx: Tx, projectId: string) => {
	const owners = await activeRuntimeOwners(tx, projectId);
	if (owners.length > 0)
		throw invalidInput(
			"managerConfig.ade",
			`Stop or reconcile the current agents before you change the execution service: ${owners.map((owner) => `${owner.id} (${owner.state})`).join(", ")}.`,
		);
};
