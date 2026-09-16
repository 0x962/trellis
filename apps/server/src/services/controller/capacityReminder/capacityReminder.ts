import { sql } from "drizzle-orm";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { type CapacityObservation, occupiesSlot } from "../../assignments/occupiesSlot/index.ts";
import { managerConfigOf } from "../../projectRows.ts";
import { columns, type Delegation, usage } from "../../submanagers/queries.ts";
import { managerScope } from "../../submanagers/scope.ts";
import { enabled } from "../nextActions/queries.ts";

export const capacityReminder = async (tx: Tx, input: { projectId: string } & CapacityObservation) => {
	const candidates = await rows<{
		projectId: string;
		manager_config: unknown;
		occupiedSlots: number;
		unfinishedTickets: number;
	}>(
		tx,
		sql`SELECT p.id AS "projectId",p.manager_config,
		(SELECT count(*)::int FROM agent_runs r WHERE r.project_id=p.id
		 AND r.kind<>'manager' AND r.runtime='native' AND r.closed_at IS NULL AND ${occupiesSlot(sql`r.terminal_id`, input)}) AS "occupiedSlots",
		(SELECT count(*)::int FROM tickets t WHERE t.project_id=p.id AND t.completed_at IS NULL) AS "unfinishedTickets"
		FROM projects p WHERE p.id IN (${managerScope(input.projectId)})
		AND EXISTS (SELECT 1 FROM tickets t WHERE t.project_id=p.id AND t.completed_at IS NULL)
		ORDER BY p.id`,
	);
	const projects = [];
	for (const candidate of candidates) {
		if (!(await enabled(tx, { projectId: input.projectId, ticketProjectId: candidate.projectId }))) continue;
		const workerLimit = managerConfigOf(candidate).concurrency;
		const freeSlots = Math.max(0, workerLimit - candidate.occupiedSlots);
		if (!freeSlots) continue;
		projects.push({
			projectId: candidate.projectId,
			workerLimit,
			occupiedSlots: candidate.occupiedSlots,
			freeSlots,
			unfinishedTickets: candidate.unfinishedTickets,
		});
	}
	let freeSlots = projects.reduce((total, project) => total + project.freeSlots, 0);
	if (!freeSlots) return null;
	const [delegation] = await rows<Delegation>(
		tx,
		sql`SELECT ${columns} FROM manager_delegations WHERE project_id=${input.projectId} AND retired_at IS NULL`,
	);
	if (delegation) {
		const counts = await usage(tx, { ...delegation, sessions: input.sessions });
		freeSlots = Math.min(freeSlots, Math.max(0, delegation.capacity - counts.activeWorkers - counts.childCapacity));
	}
	if (!freeSlots) return null;
	return {
		type: "below_worker_capacity" as const,
		message: "Work is below full worker capacity while unfinished tickets remain.",
		freeSlots,
		unfinishedTickets: projects.reduce((total, project) => total + project.unfinishedTickets, 0),
		projects,
	};
};
