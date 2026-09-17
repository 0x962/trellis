import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { dispatchColumns } from "../controller/controller.ts";
import { workItems } from "../controller/coordination.ts";
import type { Dispatch } from "../controller/types.ts";
import { managerScope } from "./scope.ts";

export const handoff = async (tx: Tx, input: { from: string; to: string; scope: string; now: Date }) => {
	const tickets = new Set(
		(
			await rows<{ id: string }>(
				tx,
				sql`SELECT id FROM tickets WHERE project_id IN (${managerScope(input.scope, true)})`,
			)
		).map((ticket) => ticket.id),
	);
	const dispatches = await rows<Dispatch>(
		tx,
		sql`SELECT ${dispatchColumns} FROM manager_dispatches
		WHERE project_id=${input.from} AND work_state='open' AND state IN ('sending','sent','unknown')`,
	);
	for (const dispatch of dispatches) {
		const pending = workItems(dispatch);
		const transferred = pending.filter((item) => item.ticketId !== null && tickets.has(item.ticketId));
		if (!transferred.length) continue;
		const outcomes = [
			...dispatch.outcomes,
			...transferred.map((item) => ({
				ticketId: item.ticketId,
				status: "no_action",
				reason: "Project coordination transferred to another manager.",
				reference: input.to,
			})),
		];
		const handled = transferred.length === pending.length;
		await tx.execute(sql`UPDATE manager_dispatches SET outcomes=${JSON.stringify(outcomes)}::jsonb,
			work_state=${handled ? "handled" : "open"},handled_at=${handled ? input.now : null} WHERE id=${dispatch.id}`);
	}
	await tx.execute(sql`UPDATE manager_next_actions SET project_id=${input.to},notified_at=NULL
		WHERE project_id=${input.from} AND state='waiting'
		AND ticket_id IN (SELECT id FROM tickets WHERE project_id IN (${managerScope(input.scope, true)}))`);
	await tx.execute(sql`INSERT INTO manager_controller_cursors (project_id,activity_id) VALUES (${input.to},0)
		ON CONFLICT (project_id) DO UPDATE SET activity_id=0`);
	await tx.execute(sql`UPDATE manager_dispatches SET events=(SELECT COALESCE(jsonb_agg(event),'[]'::jsonb)
		FROM jsonb_array_elements(events) event WHERE event->>'ticketId' NOT IN (
		SELECT id FROM tickets WHERE project_id IN (${managerScope(input.scope, true)})))
		WHERE project_id=${input.from} AND state='pending'`);
};
