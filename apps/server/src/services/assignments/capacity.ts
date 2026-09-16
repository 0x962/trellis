import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { managerConfigOf, projectRow } from "../projectRows.ts";
import { columns, type Delegation, usage } from "../submanagers/queries.ts";
import { ownerProject } from "../submanagers/scope.ts";
import { type CapacityObservation, occupiesSlot } from "./occupiesSlot/index.ts";

export const capacityAvailable = async (
	tx: Tx,
	input: { projectId: string; excludeRunId?: string } & CapacityObservation,
) => {
	const config = managerConfigOf(await projectRow(tx, input.projectId));
	const [active] = await rows<{ count: number }>(
		tx,
		sql`SELECT count(*)::int AS count FROM agent_runs
 WHERE project_id=${input.projectId} AND kind <> 'manager' AND runtime='native' AND closed_at IS NULL AND id IS DISTINCT FROM ${input.excludeRunId ?? null}
 AND ${occupiesSlot(sql`terminal_id`, input)}`,
	);
	if (active!.count >= config.concurrency) return false;
	const owner = await ownerProject(tx, input.projectId);
	const [delegation] = await rows<Delegation>(
		tx,
		sql`SELECT ${columns} FROM manager_delegations WHERE project_id=${owner ?? null} AND retired_at IS NULL`,
	);
	if (!delegation) return true;
	const counts = await usage(tx, { ...delegation, sessions: input.sessions, excludeRunId: input.excludeRunId });
	return counts.activeWorkers + counts.childCapacity < delegation.capacity;
};
