import type { Status, StatusCategory } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import type { ServiceCtx } from "../context.ts";
import { iso, rows } from "../db/queries/support.ts";
import { ticketSummaries } from "../db/queries/ticketSummaries.ts";
import type { Tx } from "../db/tx.ts";
import { record } from "./activity.ts";
import { applyStatusTransition } from "./statusTransition.ts";

// One ticket with the status it points at. Timestamps are ISO strings.
export type TicketOnStatus = {
	id: string;
	projectId: string;
	statusId: string;
	statusName: string;
	category: StatusCategory;
	startedAt: string | null;
	completedAt: string | null;
};

export const ticketsOn = (tx: Tx, where: SQL) =>
	rows<TicketOnStatus>(
		tx,
		sql`SELECT t.id, t.project_id AS "projectId", t.status_id AS "statusId",
				s.name AS "statusName", s.category,
				${iso(sql`t.started_at`)} AS "startedAt", ${iso(sql`t.completed_at`)} AS "completedAt"
			FROM tickets t JOIN statuses s ON s.id = t.status_id
			WHERE ${where} ORDER BY t.number`,
	);

export type StatusTarget = Pick<Status, "id" | "name" | "category">;

export type MoveInput = {
	ticket: TicketOnStatus;
	to: StatusTarget;
	batchId: string;
	action: string;
	// A move a person asked for touches `updated_at`; a remap does not.
	userVisible: boolean;
};

const toDate = (value: string | null) => (value === null ? null : new Date(value));

// Points one ticket at `to`. The two timestamps follow the transition rules
// and `version` rises by one. One activity row records the status names in
// its values and the ids and categories in its meta.
export const moveTicketStatus = async (
	ctx: ServiceCtx,
	tx: Tx,
	{ ticket, to, batchId, action, userVisible }: MoveInput,
) => {
	const stamps = applyStatusTransition({
		startedAt: toDate(ticket.startedAt),
		completedAt: toDate(ticket.completedAt),
		from: ticket.category,
		to: to.category,
		now: ctx.now,
	});
	await tx.execute(
		sql`UPDATE tickets SET status_id = ${to.id}, started_at = ${stamps.startedAt}, completed_at = ${stamps.completedAt},
			version = version + 1 ${userVisible ? sql`, updated_at = ${ctx.now}` : sql``}
			WHERE id = ${ticket.id}`,
	);
	await record(ctx, tx, {
		projectId: ticket.projectId,
		ticketId: ticket.id,
		action,
		batchId,
		changes: [
			{
				field: "status",
				from: ticket.statusName,
				to: to.name,
				meta: { fromId: ticket.statusId, toId: to.id, fromCategory: ticket.category, toCategory: to.category },
			},
		],
	});
};

// One `ticket.updated` event per id, with the summary as it is after the
// writes of this transaction.
export const emitTicketUpdates = async (ctx: ServiceCtx, tx: Tx, ids: string[], batchId: string) => {
	for (const summary of await ticketSummaries(tx, ids)) {
		ctx.emit({ type: "ticket.updated", summary, fields: ["status"], batchId });
	}
};
