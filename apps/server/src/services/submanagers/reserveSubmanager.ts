import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { getRun } from "../agentRuns/queries.ts";
import { reserve } from "../agentRuns/reserve.ts";
import { enabled } from "../controller/nextActions/queries.ts";
import { projectLaunchConfig } from "../projectLaunchConfig/projectLaunchConfig.ts";
import { resolveMutableProject } from "../refs.ts";
import { requireManager } from "./access.ts";
import { handoff } from "./handoff.ts";
import { launchConfig } from "./launchConfig.ts";
import { columns, type Delegation, getDelegation, usage } from "./queries.ts";
import { isManaged, managerScope } from "./scope.ts";

export type Input = { project: string; capacity: number; brief: string; requestId: string; accountId?: string };
export const reserveSubmanager = async (ctx: ServiceCtx, tx: Tx, input: Input, exited: string[] = []) => {
	const parent = await requireManager(ctx, tx);
	const project = await resolveMutableProject(ctx, tx, input.project);
	const [existing] = await rows<Delegation>(
		tx,
		sql`SELECT ${columns} FROM manager_delegations
		WHERE project_id=${project.id} AND retired_at IS NULL`,
	);
	if (existing && existing.parentRunId !== parent.id)
		throw invalidInput("project", "Another manager owns this delegation.");
	const [request] = await rows<{
		target: {
			capacity: number;
			brief: string;
			accountId?: string | null;
			requestedAccountId?: string | null;
			personaId: string;
		};
		run_id: string;
	}>(
		tx,
		sql`SELECT target,run_id FROM agent_start_requests WHERE actor_kind='agent' AND actor_name=${parent.id} AND request_id=${input.requestId}`,
	);
	if (
		request &&
		(request.target.capacity !== input.capacity ||
			request.target.brief !== input.brief ||
			(request.target.requestedAccountId ?? null) !== (input.accountId ?? null))
	)
		throw invalidInput("requestId", "This request ID already belongs to a different delegation.");
	if (request && (!existing || request.run_id !== existing.runId))
		throw invalidInput("requestId", "This delegation has retired. Use a new request ID for new work.");
	if (!existing) {
		const [owned] = await rows(
			tx,
			sql`SELECT p.id FROM projects p WHERE p.id=${project.id}
			AND p.id<>${parent.projectId} AND p.id IN (${managerScope(parent.projectId)}) AND NOT ${isManaged(sql`p`)}`,
		);
		if (!owned) throw invalidInput("project", "Delegate an unmanaged child subtree in your current project scope.");
		const busy = await rows(
			tx,
			sql`SELECT id FROM agent_runs WHERE project_id=${project.id} AND kind='manager' AND closed_at IS NULL`,
		);
		if (busy.length) throw invalidInput("project", "This project already has an active manager.");
	}
	const previous = existing ? await getRun(tx, existing.runId) : undefined;
	if (!request && !(await enabled(tx, { projectId: parent.projectId, ticketProjectId: project.id })))
		throw invalidInput("project", "Resume project dispatch before you start a delegation.");
	const parentConfig = await launchConfig(tx, parent.id);
	const childConfig = await projectLaunchConfig(tx, { projectId: project.id });
	const reservation = await reserve(
		ctx,
		tx,
		{
			project: project.id,
			personaId: request?.target.personaId ?? parent.personaId,
			requestId: input.requestId,
			accountId: request
				? (request.target.accountId ?? undefined)
				: (input.accountId ?? previous?.accountId ?? parent.accountId ?? undefined),
		},
		exited,
		{
			delegated: true,
			config: { ...parentConfig, directory: childConfig.directory, concurrency: childConfig.concurrency },
		},
	);
	if (reservation.replay) return reservation;
	if (existing) {
		if (existing.capacity !== input.capacity || existing.brief !== input.brief)
			throw invalidInput("capacity", "Resume with the saved capacity and brief. Use resize to change capacity.");
	} else {
		await tx.execute(sql`INSERT INTO manager_delegations (run_id,parent_run_id,project_id,capacity,brief,created_at)
			VALUES (${reservation.run.id},${parent.id},${project.id},${input.capacity},${input.brief},${ctx.now})`);
		const ownUsage = await usage(tx, { runId: reservation.run.id, projectId: project.id });
		if (ownUsage.activeWorkers > input.capacity)
			throw invalidInput("capacity", "The budget must cover the workers already assigned in this subtree.");
		const parentDelegation = await getDelegation(tx, parent.id);
		if (parentDelegation) {
			const parentUsage = await usage(tx, { runId: parent.id, projectId: parent.projectId });
			if (parentUsage.activeWorkers + parentUsage.childCapacity > parentDelegation.capacity)
				throw invalidInput("capacity", "The parent budget must cover its workers and its submanager reservations.");
		}
		await handoff(tx, { from: parent.projectId, to: project.id, scope: project.id, now: ctx.now });
	}
	await tx.execute(sql`UPDATE agent_start_requests SET target=target || ${JSON.stringify({ capacity: input.capacity, brief: input.brief, requestedAccountId: input.accountId ?? null })}::jsonb
		WHERE actor_kind='agent' AND actor_name=${parent.id} AND request_id=${input.requestId}`);
	return {
		...reservation,
		context: `${reservation.context}\nParent manager: ${parent.id}\nDelegated subtree: ${project.id}\nDedicated worker capacity: ${input.capacity}\nAssignment: ${input.brief}`,
	};
};
