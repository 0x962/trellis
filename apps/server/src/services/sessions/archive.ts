import type { SessionArchiveInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import { invalidInput } from "../../errors.ts";
import { upsert } from "../actors.ts";
import { stopNative } from "../agentRuns/nativeLifecycle.ts";
import { getRun } from "../agentRuns/queries.ts";
import { type StopRunDeps, stopRunProcess } from "../agentRuns/stopRunProcess.ts";
import type { IoCtx } from "../support.ts";
import { sessionOperation } from "./operation.ts";
import { sessionProcess } from "./process.ts";
import { getSession, resolveSession } from "./queries.ts";

const heldByProject = () =>
	invalidInput("id", "A session of a project cannot be archived. Move the session out of the project first.");

const pinnedSession = () => invalidInput("id", "Unpin the session before you archive it.");

// Puts a session away, or brings it back. An archived session keeps its
// directory, every file in it, and the conversation of its agent.
//
// Two rules hold for every archived session. It runs no agent, so the archive
// stops the agent and every start path refuses the session until a person
// brings it back. It belongs to no project, so a session that holds one
// cannot be archived and `sessions.move` refuses a move while the session is
// away.
//
// The stop of the agent takes seconds, and `sessions.move` writes the project
// of the run in that time without this call noticing. The UPDATE therefore
// reads the project again, and a session that gained one keeps no archive
// time.
//
// A call that asks for the state the session already holds changes nothing.
export const prepareSetArchived = async (
	ctx: IoCtx,
	input: SessionArchiveInput,
	deps: StopRunDeps = { process: sessionProcess, stop: stopNative },
) => {
	const target = await ctx.newTx((tx) => resolveSession(tx, input.id));
	return sessionOperation(ctx.home, target.runId, async () => {
		const session = await ctx.newTx((tx) => getSession(tx, target.id));
		if ((session.archivedAt !== null) === input.archived) return session;
		if (input.archived && session.projectId !== null) throw heldByProject();
		if (input.archived && session.pinnedAt !== null) throw pinnedSession();
		if (input.archived) await stopRunProcess(ctx, await ctx.newTx((tx) => getRun(tx, session.runId)), deps);
		const archivedAt = input.archived ? ctx.now() : null;
		const changed = await ctx.newTx(async (tx) => {
			await upsert(ctx.core, tx, ctx.actor);
			const written = await rows<{ id: string }>(
				tx,
				input.archived
					? sql`UPDATE sessions SET archived_at = ${archivedAt}, updated_at = ${ctx.now()}
						WHERE id = ${session.id}
						AND (SELECT project_id FROM agent_runs WHERE agent_runs.id = sessions.run_id) IS NULL
						AND (SELECT pinned_at FROM agent_runs WHERE agent_runs.id = sessions.run_id) IS NULL
						RETURNING id`
					: sql`UPDATE sessions SET archived_at = NULL, updated_at = ${ctx.now()}
						WHERE id = ${session.id} RETURNING id`,
			);
			if (written.length === 0) {
				const current = await getSession(tx, session.id);
				if (current.pinnedAt !== null) throw pinnedSession();
				throw heldByProject();
			}
			return getSession(tx, session.id);
		});
		ctx.log(input.archived ? "session archived" : "session unarchived", {
			session: session.id,
			run: session.runId,
			stoppedProcess: input.archived,
		});
		ctx.emit({ type: "sessions.changed", id: session.id });
		ctx.emit({ type: "agent-runs.changed", id: session.runId });
		return changed;
	});
};
