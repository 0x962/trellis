import type { Status, StatusCategory } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { type ServiceCtx, SYSTEM_ACTOR } from "../context.ts";
import { statusScope } from "../db/queries/statusScope.ts";
import { iso, rows, textArray } from "../db/queries/support.ts";
import { ticketSummaries } from "../db/queries/ticketSummaries.ts";
import type { Tx } from "../db/tx.ts";
import { record } from "./activity.ts";
import { applyStatusTransition } from "./statusTransition.ts";

// One ticket with the status it points at. Timestamps are ISO strings.
export type TicketOnStatus = {
	id: string;
	rootId: string;
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
		sql`SELECT t.id, t.root_id AS "rootId", t.project_id AS "projectId", t.status_id AS "statusId",
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
		rootId: ticket.rootId,
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

type Target = StatusTarget & { isDefault: boolean };

// The target for one ticket: the status with the same name and category,
// else the lowest-position status of the same category, else the default.
const pickTarget = (targets: Target[], ticket: TicketOnStatus): StatusTarget => {
	const name = ticket.statusName.toLowerCase();
	return (
		targets.find((target) => target.category === ticket.category && target.name.toLowerCase() === name) ??
		targets.find((target) => target.category === ticket.category) ??
		(targets.find((target) => target.isDefault) as Target)
	);
};

export type RemapInput = { projectId: string; toOwnerId: string };

// Restores the status invariant for the scope of `projectId`: the project
// and every descendant that owns no statuses. Every ticket of the scope
// whose status is not in the set of `toOwnerId` moves onto that set. The
// moves are system work: one batch as system:trellis, a version bump, and
// no change to `updated_at`. Returns the number of tickets moved.
export const remapScope = async (ctx: ServiceCtx, tx: Tx, { projectId, toOwnerId }: RemapInput) => {
	const scope = await statusScope(tx, projectId);
	const targets = await rows<Target>(
		tx,
		sql`SELECT id, name, category, is_default AS "isDefault" FROM statuses WHERE project_id = ${toOwnerId} ORDER BY position, id`,
	);
	const tickets = await ticketsOn(tx, sql`t.project_id = ANY(${textArray(scope)}) AND s.project_id <> ${toOwnerId}`);
	if (tickets.length === 0) return 0;
	const system: ServiceCtx = { ...ctx, actor: SYSTEM_ACTOR, session: null };
	const batchId = ulid();
	for (const ticket of tickets) {
		const to = pickTarget(targets, ticket);
		await moveTicketStatus(system, tx, { ticket, to, batchId, action: "status.remapped", userVisible: false });
	}
	await emitTicketUpdates(
		ctx,
		tx,
		tickets.map((ticket) => ticket.id),
		batchId,
	);
	return tickets.length;
};
