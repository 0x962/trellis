import type { SessionRenameInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail, invalidInput } from "../../errors.ts";
import { getSession, resolveSession } from "./queries.ts";
import { sessionSlug } from "./sessionName.ts";

type RenameSession = { id: string; runId: string };

export const rename = async (ctx: ServiceCtx, tx: Tx, input: SessionRenameInput) => {
	requireActor(ctx);
	const name = sessionSlug(input.name);
	if (name === "") throw invalidInput("name", "Use at least one letter or digit in the name.");
	const target = await resolveSession(tx, input.id);
	const [session] = await rows<RenameSession>(
		tx,
		sql`SELECT id, run_id AS "runId" FROM sessions WHERE id = ${target.id} FOR UPDATE`,
	);
	if (session === undefined) throw fail("NOT_FOUND", { kind: "session", ref: input.id });
	const taken = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM sessions WHERE name = ${name} AND id <> ${session.id} LIMIT 1`,
	);
	if (taken.length > 0) throw fail("DUPLICATE", { field: "name" });
	await tx.execute(sql`UPDATE sessions SET name = ${name}, updated_at = ${ctx.now} WHERE id = ${session.id}`);
	await tx.execute(sql`UPDATE agent_runs SET name = ${name}, updated_at = ${ctx.now} WHERE id = ${session.runId}`);
	const renamed = await getSession(tx, session.id);
	ctx.emit({ type: "sessions.changed", id: session.id });
	ctx.emit({ type: "agent-runs.changed", id: session.runId });
	return renamed;
};
