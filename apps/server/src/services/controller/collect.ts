import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { collectHeartbeats } from "./collectHeartbeats.ts";
import type { ControllerCtx, ControllerEvent, ControllerInput } from "./types.ts";

export const collect = async (ctx: ControllerCtx, tx: Tx, input: ControllerInput) => {
	const projects = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM projects WHERE manager_config->>'personaId' IS NOT NULL AND archived_at IS NULL`,
	);
	for (const project of projects) {
		const [active] = await rows<{ id: string; state: string; events: ControllerEvent[] }>(
			tx,
			sql`SELECT id, state, events FROM manager_dispatches WHERE project_id = ${project.id} AND state IN ('pending', 'sending', 'unknown')`,
		);
		if (active && (active.state !== "pending" || active.events.length >= 100)) continue;
		await tx.execute(
			sql`INSERT INTO manager_controller_cursors (project_id) VALUES (${project.id}) ON CONFLICT DO NOTHING`,
		);
		const [cursor] = await rows<{ activity_id: number }>(
			tx,
			sql`SELECT activity_id FROM manager_controller_cursors WHERE project_id = ${project.id}`,
		);
		const found = await rows<{
			id: number;
			ticket_id: string | null;
			action: string;
			actor_name: string;
			actor_kind: string;
			created_at: string;
			manager: boolean;
		}>(
			tx,
			sql`WITH RECURSIVE scope AS (
				SELECT id FROM projects WHERE id = ${project.id}
				UNION ALL SELECT p.id FROM projects p JOIN scope s ON p.parent_id = s.id
				WHERE p.manager_config->>'personaId' IS NULL AND p.archived_at IS NULL
			) SELECT a.id, a.ticket_id, a.action, a.actor_name, a.actor_kind, ${iso(sql`a.created_at`)} AS created_at,
				EXISTS (SELECT 1 FROM agent_runs r WHERE r.id = a.actor_name AND r.kind = 'manager' AND r.project_id = ${project.id} AND a.actor_kind = 'agent') AS manager
			FROM activity a WHERE a.project_id IN (SELECT id FROM scope) AND a.id > ${cursor!.activity_id}
			ORDER BY a.id LIMIT ${100 - (active?.events.length ?? 0)}`,
		);
		if (found.length === 0) continue;
		const events: ControllerEvent[] = found
			.filter((event) => event.ticket_id !== null && !event.manager)
			.map((event) => ({
				id: event.id,
				ticketId: event.ticket_id!,
				action: event.action,
				actor: { name: event.actor_name, kind: event.actor_kind },
				createdAt: event.created_at,
			}));
		if (events.length > 0) {
			if (active)
				await tx.execute(
					sql`UPDATE manager_dispatches SET events = events || ${JSON.stringify(events)}::jsonb, updated_at = ${ctx.now} WHERE id = ${active.id}`,
				);
			else
				await tx.execute(sql`INSERT INTO manager_dispatches (id, project_id, events, due_at, created_at, updated_at)
				VALUES (${ulid()}, ${project.id}, ${JSON.stringify(events)}::jsonb, ${new Date(new Date(events[0]!.createdAt).getTime() + 10_000)}, ${ctx.now}, ${ctx.now})`);
		}
		await tx.execute(
			sql`UPDATE manager_controller_cursors SET activity_id = ${found.at(-1)!.id} WHERE project_id = ${project.id}`,
		);
	}
	await collectHeartbeats(ctx, tx, input);
	return {};
};
