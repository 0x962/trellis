import type { SessionMoveInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail, invalidInput } from "../../errors.ts";
import { pathOf, resolveMutableProject } from "../refs.ts";
import { getSession } from "./queries.ts";

type MovableSession = { id: string; runId: string; ticketId: string | null };

export const move = async (ctx: ServiceCtx, tx: Tx, input: SessionMoveInput) => {
	requireActor(ctx);
	const [session] = await rows<MovableSession>(
		tx,
		sql`SELECT s.id, s.run_id AS "runId", r.ticket_id AS "ticketId"
			FROM sessions s JOIN agent_runs r ON r.id = s.run_id
			WHERE s.id = ${input.id}
			FOR UPDATE OF s, r`,
	);
	if (session === undefined) throw fail("NOT_FOUND", { kind: "session", ref: input.id });
	if (session.ticketId !== null) throw invalidInput("id", "A ticket session keeps the project of its ticket.");
	const project = input.project === null ? null : await resolveMutableProject(ctx, tx, input.project);
	const projectPath = project === null ? "" : pathOf(ctx.cache, project.id);
	await tx.execute(
		sql`UPDATE agent_runs
			SET project_id = ${project?.id ?? null}, project_path = ${projectPath}, updated_at = ${ctx.now}
			WHERE id = ${session.runId}`,
	);
	await tx.execute(sql`UPDATE sessions SET updated_at = ${ctx.now} WHERE id = ${session.id}`);
	const moved = await getSession(tx, session.id);
	ctx.emit({ type: "sessions.changed", id: session.id });
	ctx.emit({ type: "agent-runs.changed", id: session.runId });
	return moved;
};
