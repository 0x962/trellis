import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import type { ControllerCtx } from "../types.ts";
import { refresh } from "./queries.ts";

export const collect = async (ctx: ControllerCtx, tx: Tx) => {
	await refresh(tx, { now: ctx.now });
	const projects = await rows<{ project_id: string }>(
		tx,
		sql`SELECT DISTINCT project_id FROM manager_next_actions a
 WHERE state='waiting' AND eligible_at IS NOT NULL AND (notified_at IS NULL OR eligible_at>notified_at)
 AND NOT EXISTS (SELECT 1 FROM manager_dispatches d WHERE d.project_id=a.project_id AND d.state IN ('pending','sending','unknown'))`,
	);
	for (const project of projects) {
		await tx.execute(
			sql`INSERT INTO manager_controller_cursors (project_id) VALUES (${project.project_id}) ON CONFLICT DO NOTHING`,
		);
		await tx.execute(sql`INSERT INTO manager_dispatches (id,project_id,events,due_at,created_at,updated_at)
   VALUES (${ulid()},${project.project_id},'[]'::jsonb,${ctx.now},${ctx.now},${ctx.now}) ON CONFLICT DO NOTHING`);
	}
};
