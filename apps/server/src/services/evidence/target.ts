import type { ServiceCtx as CoreCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { getRun } from "../agentRuns/queries.ts";
import { assertCurrentAttempt } from "../assignments/attempts.ts";

export const target = async (ctx: CoreCtx, tx: Tx, input: { runId: string; mutation?: boolean }) => {
	const run = await getRun(tx, input.runId);
	if (run.runtime !== "native" || run.workspaceId === null || run.terminalId === null)
		throw invalidInput("runId", "This run has no recorded native workspace.");
	if (input.mutation) {
		if (ctx.actor?.kind !== "human" && ctx.actor?.kind !== "agent")
			throw invalidInput("actor", "A person or current agent must request this action.");
		await assertCurrentAttempt(ctx, tx);
		if (ctx.actor.kind === "agent" && ctx.actor.name !== run.id) {
			const caller = await getRun(tx, ctx.actor.name);
			if (
				caller.kind !== "manager" ||
				caller.projectId === null ||
				run.projectId === null ||
				!ctx.cache.resolveSubtree(caller.projectId).includes(run.projectId)
			)
				throw invalidInput("runId", "An agent can inspect its own evidence or manage evidence in its project.");
		}
	}
	return { run, workspace: run.workspaceId, attemptId: run.terminalId };
};
