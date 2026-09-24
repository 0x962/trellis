import type { SessionArchiveInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { invalidInput } from "../../errors.ts";
import { upsert } from "../actors.ts";
import { stopNative } from "../agentRuns/nativeLifecycle.ts";
import { getRun } from "../agentRuns/queries.ts";
import type { IoCtx } from "../support.ts";
import { sessionOperation } from "./operation.ts";
import { sessionProcess } from "./process.ts";
import { getSession, resolveSession } from "./queries.ts";
import { stopSessionAgent } from "./stopSessionAgent.ts";

// Puts a session away, or brings it back. An archived session keeps its
// directory, its files, and the conversation of its agent, and the sidebar
// draws it under Archived in place of the session list.
//
// Two rules hold for every archived session. It runs no agent, so the archive
// stops the agent and `sessions.start` refuses until a person brings the
// session back. It belongs to no project, so a session that has one cannot be
// archived and `sessions.move` refuses a move while the session is away.
//
// A call that asks for the state the session already holds changes nothing.
export const prepareSetArchived = async (
	ctx: IoCtx,
	input: SessionArchiveInput,
	deps = { process: sessionProcess, stop: stopNative },
) => {
	const target = await ctx.newTx((tx) => resolveSession(tx, input.id));
	return sessionOperation(ctx.home, target.runId, async () => {
		const session = await ctx.newTx((tx) => getSession(tx, target.id));
		if ((session.archivedAt !== null) === input.archived) return session;
		if (input.archived && session.projectId !== null)
			throw invalidInput("id", "A session of a project cannot be archived. Move the session out of the project first.");
		if (input.archived) await stopSessionAgent(ctx, await ctx.newTx((tx) => getRun(tx, session.runId)), deps);
		const archivedAt = input.archived ? ctx.now() : null;
		const changed = await ctx.newTx(async (tx) => {
			await upsert(ctx.core, tx, ctx.actor);
			await tx.execute(
				sql`UPDATE sessions SET archived_at = ${archivedAt}, updated_at = ${ctx.now()} WHERE id = ${session.id}`,
			);
			return getSession(tx, session.id);
		});
		ctx.emit({ type: "sessions.changed", id: session.id });
		ctx.emit({ type: "agent-runs.changed", id: session.runId });
		return changed;
	});
};
