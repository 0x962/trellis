import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { isManaged, managerScope } from "../submanagers/scope.ts";
import { readySession } from "./readySession.ts";
import type { ControllerCtx, ControllerInput } from "./types.ts";

export const collectHeartbeats = async (ctx: ControllerCtx, tx: Tx, input: ControllerInput) => {
	const ready = input.sessions
		.filter(readySession)
		.map((session) => ({ id: session.id, idleAt: session.activity!.updatedAt }));
	if (ready.length === 0) return;
	const quietBefore = new Date(ctx.now.getTime() - 120_000);
	const projects = await rows<{ id: string }>(
		tx,
		sql`
		SELECT p.id FROM projects p
		JOIN manager_controller_cursors cursor ON cursor.project_id=p.id
		JOIN agent_runs r ON r.project_id=p.id AND r.kind='manager' AND r.runtime='native' AND r.closed_at IS NULL
		JOIN jsonb_to_recordset(${JSON.stringify(ready)}::jsonb) AS live(id text, "idleAt" timestamptz) ON live.id=r.terminal_id
		WHERE ${isManaged(sql`p`)} AND p.archived_at IS NULL
		AND NOT EXISTS (SELECT 1 FROM settings WHERE key='nativeWorkPaused' AND value='true'::jsonb)
		AND GREATEST(r.created_at, live."idleAt",
			(SELECT max(updated_at) FROM manager_dispatches WHERE project_id=p.id AND state='sent')) < ${quietBefore}
		AND NOT EXISTS (SELECT 1 FROM manager_dispatches WHERE project_id=p.id AND state IN ('pending','sending','unknown'))
		AND NOT EXISTS (WITH RECURSIVE ancestors AS (
			SELECT id,parent_id,archived_at FROM projects WHERE id=p.id
			UNION ALL SELECT parent.id,parent.parent_id,parent.archived_at FROM projects parent JOIN ancestors child ON parent.id=child.parent_id
		) SELECT 1 FROM ancestors WHERE archived_at IS NOT NULL)
		AND NOT EXISTS ( SELECT 1 FROM activity a WHERE a.project_id IN (${managerScope(sql`p.id`)}) AND a.id>cursor.activity_id
			AND a.ticket_id IS NOT NULL AND NOT EXISTS (
				SELECT 1 FROM agent_runs manager WHERE manager.id=a.actor_name AND manager.kind='manager'
				AND manager.project_id=p.id AND a.actor_kind='agent'
			))
	`,
	);
	for (const project of projects)
		await tx.execute(sql`INSERT INTO manager_dispatches (id,project_id,events,due_at,created_at,updated_at)
			VALUES (${ulid()},${project.id},'[]'::jsonb,${ctx.now},${ctx.now},${ctx.now}) ON CONFLICT DO NOTHING`);
};
