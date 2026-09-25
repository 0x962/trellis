import type { SessionRenameInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail, invalidInput } from "../../errors.ts";
import { getSession, resolveSession } from "./queries.ts";

type RenameSession = { id: string; runId: string };

const saveName = async (ctx: ServiceCtx, tx: Tx, session: RenameSession, name: string) => {
	await tx.execute(
		sql`UPDATE sessions SET name = ${name}, name_state = 'set', updated_at = ${ctx.now} WHERE id = ${session.id}`,
	);
	await tx.execute(sql`UPDATE agent_runs SET name = ${name}, updated_at = ${ctx.now} WHERE id = ${session.runId}`);
	const renamed = await getSession(tx, session.id);
	ctx.emit({ type: "sessions.changed", id: session.id });
	ctx.emit({ type: "agent-runs.changed", id: session.runId });
	return renamed;
};

// Two sessions can use the same name.
// Rename does not change the folder.
export const rename = async (ctx: ServiceCtx, tx: Tx, input: SessionRenameInput) => {
	requireActor(ctx);
	const name = input.name.trim();
	if (name === "") throw invalidInput("name", "Enter a name.");
	const target = await resolveSession(tx, input.id);
	const [session] = await rows<RenameSession>(
		tx,
		sql`SELECT id, run_id AS "runId" FROM sessions WHERE id = ${target.id} FOR UPDATE`,
	);
	if (session === undefined) throw fail("NOT_FOUND", { kind: "session", ref: input.id });
	return saveName(ctx, tx, session, name);
};

export const saveRequestedName = async (ctx: ServiceCtx, tx: Tx, input: SessionRenameInput) => {
	const name = input.name.trim();
	const [session] = await rows<RenameSession>(
		tx,
		sql`SELECT id, run_id AS "runId" FROM sessions WHERE id = ${input.id} AND name_state = 'requested' FOR UPDATE`,
	);
	return session === undefined ? null : saveName(ctx, tx, session, name);
};
