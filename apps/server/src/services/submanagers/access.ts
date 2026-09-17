import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { getRun } from "../agentRuns/queries.ts";
import { getDelegation } from "./queries.ts";
import { ownerProject } from "./scope.ts";

export const requireManager = async (ctx: ServiceCtx, tx: Tx) => {
	if (ctx.actor?.kind !== "agent") throw invalidInput("actor", "Use the current manager to delegate project work.");
	const run = await getRun(tx, ctx.actor.name);
	if (run.kind !== "manager" || run.closedAt !== null || run.projectId === null)
		throw invalidInput("actor", "Use an active manager with a current project.");
	const delegation = await getDelegation(tx, run.id);
	if (delegation?.retiredAt) throw invalidInput("actor", "This delegation has retired.");
	return run as typeof run & { projectId: string };
};

export const requireParent = async (ctx: ServiceCtx, tx: Tx, id: string) => {
	const delegation = await getDelegation(tx, id);
	if (!delegation || delegation.retiredAt) throw invalidInput("id", "Select an active delegation.");
	if (ctx.actor?.kind !== "human" && (await requireManager(ctx, tx)).id !== delegation.parentRunId)
		throw invalidInput("actor", "Only the parent manager can change this delegation.");
	return delegation;
};

export const assertAssignmentOwner = async (ctx: ServiceCtx, tx: Tx, projectId: string) => {
	if (ctx.actor?.kind !== "agent") return;
	const [manager] = await rows<{ project_id: string; closed_at: string | null }>(
		tx,
		sql`SELECT project_id,closed_at FROM agent_runs WHERE id=${ctx.actor.name} AND kind='manager'`,
	);
	if (!manager) return;
	const owner = await ownerProject(tx, projectId);
	const delegated = await rows(
		tx,
		sql`SELECT run_id FROM manager_delegations
		WHERE run_id=${ctx.actor.name} OR (project_id=${owner ?? null} AND retired_at IS NULL)`,
	);
	if (!delegated.length) return;
	if (manager.closed_at !== null || owner !== manager.project_id)
		throw invalidInput("project", "Only the current manager for this project scope can assign its workers.");
};
