import { sql } from "drizzle-orm";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { notFound } from "../support.ts";
import { readySession } from "./readySession.ts";
import type { ControllerCtx, ControllerInput, Dispatch } from "./types.ts";

export const dispatchColumns = sql`id, project_id AS "projectId", run_id AS "runId", terminal_id AS "terminalId", session_id AS "sessionId", generation, state, work_state AS "workState", outcomes, ${iso(sql`handled_at`)} AS "handledAt", events, ${iso(sql`due_at`)} AS "dueAt", error`;
const columns = dispatchColumns;

export const list = (
	_ctx: ControllerCtx,
	tx: Tx,
	input: { projectId?: string; unhandled?: boolean; before?: string },
) =>
	rows<Dispatch>(
		tx,
		sql`SELECT ${columns} FROM manager_dispatches WHERE ${input.projectId ? sql`project_id = ${input.projectId}` : sql`true`}
		AND ${input.unhandled ? sql`work_state = 'open'` : sql`true`}
		AND ${input.before ? sql`id < ${input.before}` : sql`true`} ORDER BY id DESC LIMIT 100`,
	);

export const claim = async (ctx: ControllerCtx, tx: Tx, input: ControllerInput): Promise<Dispatch | null> => {
	const ready = input.sessions.filter(readySession).map((session) => session.id);
	if (ready.length === 0) return null;
	const [next] = await rows<{
		id: string;
		project_id: string;
		run_id: string;
		terminal_id: string;
		session_id: string | null;
	}>(
		tx,
		sql`SELECT d.id, d.project_id, r.id AS run_id, r.terminal_id, r.session_id
			FROM manager_dispatches d JOIN projects p ON p.id = d.project_id
			JOIN agent_runs r ON r.project_id = p.id AND r.kind = 'manager' AND r.closed_at IS NULL
			WHERE d.state = 'pending' AND d.due_at <= ${ctx.now} AND r.terminal_id IS NOT NULL
			AND p.manager_config->>'personaId' IS NOT NULL AND p.archived_at IS NULL
			AND p.manager_config->>'dispatchPaused' IS DISTINCT FROM 'true'
			AND NOT EXISTS (SELECT 1 FROM settings WHERE key='nativeWorkPaused' AND value='true'::jsonb)
			AND r.runtime = 'native' AND r.terminal_id IN (${sql.join(
				ready.map((id) => sql`${id}`),
				sql`,`,
			)})
			AND NOT EXISTS (WITH RECURSIVE ancestors AS (
				SELECT id, parent_id, archived_at FROM projects WHERE id = p.id
				UNION ALL SELECT parent.id, parent.parent_id, parent.archived_at FROM projects parent JOIN ancestors child ON parent.id = child.parent_id
			) SELECT 1 FROM ancestors WHERE archived_at IS NOT NULL)
			ORDER BY d.due_at, d.id LIMIT 1`,
	);
	if (!next) return null;
	const [cursor] = await rows<{ generation: number }>(
		tx,
		sql`UPDATE manager_controller_cursors SET generation = generation + 1 WHERE project_id = ${next.project_id} RETURNING generation`,
	);
	const [delivery] = await rows<Dispatch>(
		tx,
		sql`UPDATE manager_dispatches SET state = 'sending', generation = ${cursor!.generation}, run_id = ${next.run_id}, terminal_id = ${next.terminal_id}, session_id = ${next.session_id}, updated_at = ${ctx.now}
		WHERE id = ${next.id} AND state = 'pending' RETURNING ${columns}`,
	);
	return delivery!;
};

export const complete = async (
	ctx: ControllerCtx,
	tx: Tx,
	input: { id: string; generation: number; state: "sent" | "unknown"; error: string | null },
) => {
	await tx.execute(sql`UPDATE manager_dispatches SET state = ${input.state}, error = ${input.error}, updated_at = ${ctx.now}
		WHERE id = ${input.id} AND generation = ${input.generation} AND state = 'sending'
		AND generation = (SELECT generation FROM manager_controller_cursors WHERE project_id = manager_dispatches.project_id)`);
	return {};
};

export const recover = async (ctx: ControllerCtx, tx: Tx, _input: Record<string, never>) => {
	await tx.execute(sql`UPDATE manager_controller_cursors SET generation = generation + 1`);
	await tx.execute(
		sql`UPDATE comment_deliveries SET state='unknown',error='The server stopped before it recorded the delivery result.' WHERE state='sending'`,
	);
	await tx.execute(
		sql`UPDATE manager_dispatches SET state = 'unknown', error = 'The host stopped before it recorded the send result. Confirm the agent received the message before a resend.', updated_at = ${ctx.now} WHERE state = 'sending'`,
	);
	return {};
};

export const retry = async (ctx: ControllerCtx, tx: Tx, input: { id: string }) => {
	const [delivery] = await rows<Dispatch>(
		tx,
		sql`UPDATE manager_dispatches SET state = 'pending', error = NULL, due_at = ${ctx.now}, updated_at = ${ctx.now}
		WHERE id = ${input.id} AND state = 'unknown' RETURNING ${columns}`,
	);
	if (!delivery) throw notFound("unknownManagerDispatch", input.id);
	return delivery;
};

export const resolveUnknown = async (ctx: ControllerCtx, tx: Tx, input: { id: string }) => {
	const [delivery] = await rows<Dispatch>(
		tx,
		sql`UPDATE manager_dispatches SET state = 'sent', error = NULL, updated_at = ${ctx.now}
		WHERE id = ${input.id} AND state = 'unknown' RETURNING ${columns}`,
	);
	if (!delivery) throw notFound("unknownManagerDispatch", input.id);
	return delivery;
};

export const defer = async (
	ctx: ControllerCtx,
	tx: Tx,
	input: { id: string; generation: number; error: string | null },
) => {
	await tx.execute(sql`UPDATE manager_dispatches SET state='pending',error=${input.error},updated_at=${ctx.now}
		WHERE id=${input.id} AND generation=${input.generation} AND state='sending'
		AND generation=(SELECT generation FROM manager_controller_cursors WHERE project_id=manager_dispatches.project_id)`);
	return {};
};
