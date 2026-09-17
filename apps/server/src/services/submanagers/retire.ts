import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { prepareStop } from "../agentRuns/lifecycle.ts";
import { getRun } from "../agentRuns/queries.ts";
import type { IoCtx } from "../support.ts";
import { requireParent } from "./access.ts";
import { handoff } from "./handoff.ts";
import { getDelegation } from "./queries.ts";

export const checkRetirement = async (ctx: ServiceCtx, tx: Tx, id: string) => {
	const delegation = await requireParent(ctx, tx, id);
	const children = await rows(
		tx,
		sql`SELECT run_id FROM manager_delegations WHERE parent_run_id=${id} AND retired_at IS NULL`,
	);
	if (children.length) throw invalidInput("id", "Retire this manager's child delegations first.");
	return delegation;
};

export const release = async (ctx: ServiceCtx, tx: Tx, input: { id: string; terminalId: string | null }) => {
	const delegation = await checkRetirement(ctx, tx, input.id);
	const run = await getRun(tx, input.id);
	if (run.closedAt === null || run.terminalId !== input.terminalId)
		throw invalidInput("id", "Confirm this manager's current attempt stopped before retirement.");
	const parent = await getRun(tx, delegation.parentRunId);
	await handoff(tx, { from: delegation.projectId, to: parent.projectId!, scope: delegation.projectId, now: ctx.now });
	await tx.execute(sql`UPDATE manager_delegations SET retired_at=${ctx.now} WHERE run_id=${input.id}`);
	await tx.execute(sql`UPDATE manager_dispatches SET work_state='handled',handled_at=${ctx.now},state=CASE WHEN state='sent' THEN 'sent' ELSE 'canceled' END
		WHERE project_id=${delegation.projectId} AND (work_state='open' OR state IN ('pending','sending','unknown'))`);
	ctx.emit({ type: "agent-runs.changed", id: input.id });
	return {};
};

export const prepareRetire = async (ctx: IoCtx, input: { id: string }) => {
	const run = await ctx.newTx(async (tx) => {
		const existing = await getDelegation(tx, input.id);
		if (existing?.retiredAt) {
			if (ctx.actor.kind !== "human" && ctx.actor.name !== existing.parentRunId)
				throw invalidInput("actor", "Only the parent manager can retire this delegation.");
			return null;
		}
		await checkRetirement(ctx.core, tx, input.id);
		return getRun(tx, input.id);
	});
	if (!run) return {};
	await prepareStop(ctx, input);
	return ctx.newTx((tx) => release(ctx.core, tx, { ...input, terminalId: run.terminalId }));
};
