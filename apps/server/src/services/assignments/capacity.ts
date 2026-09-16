import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { managerConfigOf, projectRow } from "../projectRows.ts";
import { columns, type Delegation, usage } from "../submanagers/queries.ts";
import { ownerProject } from "../submanagers/scope.ts";
import { type CapacityObservation, occupiesSlot } from "./occupiesSlot/index.ts";

// The two numbers that bound the start of a worker turn in a project.
// `limit` is the number of worker turns the project permits, and `running`
// is the number of worker turns that hold a slot of that limit. A project
// inside a delegation has a second bound: the budget of the delegation over
// the whole subtree. `limit` and `running` then describe the bound that
// stops the start, so a refusal states the numbers the caller must change.
// A delegation counts the budget of each child delegation as a used slot,
// because the child holds that budget for its own workers.
export type CapacityCounts = { available: boolean; limit: number; running: number };

export const capacityCounts = async (
	tx: Tx,
	input: { projectId: string; excludeRunId?: string } & CapacityObservation,
): Promise<CapacityCounts> => {
	const config = managerConfigOf(await projectRow(tx, input.projectId));
	const [active] = await rows<{ count: number }>(
		tx,
		sql`SELECT count(*)::int AS count FROM agent_runs
 WHERE project_id=${input.projectId} AND kind <> 'manager' AND runtime='native' AND closed_at IS NULL AND id IS DISTINCT FROM ${input.excludeRunId ?? null}
 AND ${occupiesSlot(sql`terminal_id`, input)}`,
	);
	const project = { limit: config.concurrency, running: active!.count };
	if (project.running >= project.limit) return { available: false, ...project };
	const owner = await ownerProject(tx, input.projectId);
	const [delegation] = await rows<Delegation>(
		tx,
		sql`SELECT ${columns} FROM manager_delegations WHERE project_id=${owner ?? null} AND retired_at IS NULL`,
	);
	if (!delegation) return { available: true, ...project };
	const counts = await usage(tx, { ...delegation, sessions: input.sessions, excludeRunId: input.excludeRunId });
	const used = counts.activeWorkers + counts.childCapacity;
	return used < delegation.capacity
		? { available: true, ...project }
		: { available: false, limit: delegation.capacity, running: used };
};

export const capacityAvailable = async (
	tx: Tx,
	input: { projectId: string; excludeRunId?: string } & CapacityObservation,
) => (await capacityCounts(tx, input)).available;

export const capacityOf = async (tx: Tx, input: { projectId: string; excludeRunId?: string } & CapacityObservation) => {
	const counts = await capacityCounts(tx, input);
	return { used: counts.running, limit: counts.limit };
};
