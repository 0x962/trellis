import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { managerConfigOf, projectRow } from "../projectRows.ts";
import { columns, type Delegation, usage } from "../submanagers/queries.ts";
import { ownerProject } from "../submanagers/scope.ts";

export const capacityOf = async (tx: Tx, input: { projectId: string }) => {
	const config = managerConfigOf(await projectRow(tx, input.projectId));
	const [active] = await rows<{ count: number }>(
		tx,
		sql`SELECT count(*)::int AS count FROM agent_runs
 WHERE project_id=${input.projectId} AND kind <> 'manager' AND runtime='native' AND closed_at IS NULL`,
	);
	const direct = { used: active!.count, limit: config.concurrency };
	if (direct.used >= direct.limit) return direct;
	const owner = await ownerProject(tx, input.projectId);
	const [delegation] = await rows<Delegation>(
		tx,
		sql`SELECT ${columns} FROM manager_delegations WHERE project_id=${owner ?? null} AND retired_at IS NULL`,
	);
	if (!delegation) return direct;
	const counts = await usage(tx, delegation);
	return { used: counts.activeWorkers + counts.childCapacity, limit: delegation.capacity };
};

export const capacityAvailable = async (tx: Tx, input: { projectId: string }) => {
	const capacity = await capacityOf(tx, input);
	return capacity.used < capacity.limit;
};
