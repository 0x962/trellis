import {
	type Priority,
	type Ticket,
	type TicketSummary,
	TicketUpdateInputSchema,
	TicketUpdateManyInputSchema,
	type TicketUpdateManyOutputSchema,
} from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { z } from "zod";
import type { ServiceCtx } from "../../context.ts";
import { statusById } from "../../db/queries/statusById.ts";
import { rows } from "../../db/queries/support.ts";
import { ticketGet } from "../../db/queries/ticketGet.ts";
import { ticketSummaries } from "../../db/queries/ticketSummaries.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import { record } from "../activity.ts";
import { assertProjectActive, resolveStatus, resolveTicket, type TicketRow } from "../refs.ts";
import { applyLabelPlan } from "./labels.ts";
import { placementChanges, resolvePlacement } from "./placement.ts";
import { type ChangePlanner, changePlanner } from "./plan.ts";
import { assertVersion, outsideProject, stampColumns } from "./rules.ts";

// The fields `update` and `updateMany` share. A ref is a canonical string;
// `parent: null` clears the parent, `epic: null` clears the epic, and
// `wave: null` clears the wave.
type ChangeInput = {
	title?: string;
	description?: string;
	priority?: Priority;
	status?: string;
	parent?: string | null;
	epic?: string | null;
	wave?: string | null;
	addLabels?: readonly string[];
	removeLabels?: readonly string[];
};

// One changed field: its activity values, and the SET clause that writes it.
// A label change carries no clause, because the labels of a ticket live in
// `ticket_labels` and not in a column of `tickets`.
type FieldChange = {
	field: string;
	from: string | null;
	to: string | null;
	meta?: Record<string, unknown>;
	set?: SQL;
};

// One ticket after `applyChanges`: its id, and the name of every field the
// write changed. An empty `fields` says the write touched nothing, so the
// ticket gets no activity row and no event.
type Applied = { id: string; fields: string[] };

// A parent must sit in the same project and must not be the ticket or one
// of its descendants. The walk down the children stops at depth 64.
const resolveParent = async (ctx: ServiceCtx, tx: Tx, row: TicketRow, ref: string) => {
	const parent = await resolveTicket(ctx, tx, ref);
	if (outsideProject(parent, row.projectId)) throw fail("CROSS_PROJECT_LINK");
	if (parent.id === row.id) throw fail("PARENT_CYCLE");
	const below = await rows<{ id: string }>(
		tx,
		sql`WITH RECURSIVE down AS (
			SELECT id, 0 AS depth FROM tickets WHERE parent_id = ${row.id}
			UNION ALL
			SELECT t.id, down.depth + 1 FROM tickets t JOIN down ON t.parent_id = down.id WHERE down.depth < 64
		)
		SELECT id FROM down WHERE id = ${parent.id} LIMIT 1`,
	);
	if (below.length > 0) throw fail("PARENT_CYCLE");
	return parent;
};

// A write that names no `status` leaves the status of the ticket alone, so
// it reads no status row.
const statusChanges = async (ctx: ServiceCtx, tx: Tx, row: TicketRow, input: ChangeInput) => {
	if (input.status === undefined) return [];
	const changes: FieldChange[] = [];
	const current = await statusById(tx, row.statusId);
	const next = await resolveStatus(ctx, tx, { projectId: row.projectId, status: input.status });
	if (next.id !== current.id) {
		changes.push({
			field: "status",
			from: current.name,
			to: next.name,
			meta: { fromId: current.id, toId: next.id, fromCategory: current.category, toCategory: next.category },
			set: sql`status_id = ${next.id}, ${stampColumns(next.category, ctx.now)}`,
		});
	}
	return changes;
};

// Applies `input` to one ticket under `batchId`: one UPDATE and one activity
// row per changed field. An input that changes nothing writes nothing.
// `planner` holds the label rows the write names, so a batch
// reads each of them once and not once per ticket.
const applyChanges = async (
	ctx: ServiceCtx,
	tx: Tx,
	batchId: string,
	row: TicketRow,
	input: ChangeInput,
	planner: ChangePlanner,
): Promise<Applied> => {
	const changes: FieldChange[] = [];
	if (input.title !== undefined && input.title !== row.title) {
		changes.push({ field: "title", from: row.title, to: input.title, set: sql`title = ${input.title}` });
	}
	if (input.description !== undefined && input.description !== row.description) {
		changes.push({
			field: "description",
			from: row.description,
			to: input.description,
			set: sql`description = ${input.description}`,
		});
	}
	if (input.priority !== undefined && input.priority !== row.priority) {
		changes.push({ field: "priority", from: row.priority, to: input.priority, set: sql`priority = ${input.priority}` });
	}
	if (input.parent !== undefined) {
		const parent = input.parent === null ? null : await resolveParent(ctx, tx, row, input.parent);
		if ((parent?.id ?? null) !== row.parentId) {
			changes.push({
				field: "parent",
				from: row.parentIdentifier,
				to: parent?.identifier ?? null,
				meta: { fromId: row.parentId, toId: parent?.id ?? null },
				set: sql`parent_id = ${parent?.id ?? null}`,
			});
		}
	}
	changes.push(...placementChanges(row, await resolvePlacement(ctx, tx, row.projectId, row, input)));
	changes.push(...(await statusChanges(ctx, tx, row, input)));
	changes.push(...(await applyLabelPlan(ctx, tx, row, await planner.labels(row.projectId))));
	if (changes.length === 0) return { id: row.id, fields: [] };

	// A write that changes labels alone has no column to set, and it still
	// raises `version`, so every client sees that the row changed.
	const sets = changes.flatMap((change) => (change.set === undefined ? [] : [change.set]));
	await tx.execute(
		sql`UPDATE tickets
			SET ${sql.join([...sets, sql`version = version + 1`, sql`updated_at = ${ctx.now}`], sql`, `)}
			WHERE id = ${row.id}`,
	);
	await record(ctx, tx, {
		projectId: row.projectId,
		ticketId: row.id,
		action: "ticket.updated",
		batchId,
		changes: changes.map(({ field, from, to, meta }) => ({ field, from, to, meta })),
	});
	return { id: row.id, fields: [...new Set(changes.map((change) => change.field))] };
};

// Reads the summary of every written ticket in one statement, and emits one
// `ticket.updated` for each ticket that changed. The result holds one summary
// per entry of `applied`, in that order.
const readAndEmit = async (ctx: ServiceCtx, tx: Tx, batchId: string, applied: Applied[]): Promise<TicketSummary[]> => {
	const found = await ticketSummaries(
		tx,
		applied.map((entry) => entry.id),
	);
	const byId = new Map(found.map((summary) => [summary.id, summary]));
	const items = applied.map((entry) => byId.get(entry.id) as TicketSummary);
	applied.forEach((entry, index) => {
		if (entry.fields.length === 0) return;
		ctx.emit({ type: "ticket.updated", summary: items[index] as TicketSummary, fields: entry.fields, batchId });
	});
	return items;
};

export const update = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<Ticket> => {
	const input = TicketUpdateInputSchema.parse(rawInput);
	const row = await resolveTicket(ctx, tx, input.ticket);
	assertProjectActive(ctx, row.projectId);
	await assertVersion(tx, row, input.expectedVersion);
	const batchId = ulid();
	const applied = await applyChanges(ctx, tx, batchId, row, input, changePlanner(ctx, tx, input));
	await readAndEmit(ctx, tx, batchId, [applied]);
	return ticketGet(tx, row.id);
};

// One batch and one transaction for up to 200 tickets: a ref that misses or
// a rule that refuses rolls every ticket back.
export const updateMany = async (
	ctx: ServiceCtx,
	tx: Tx,
	rawInput: unknown,
): Promise<z.infer<typeof TicketUpdateManyOutputSchema>> => {
	const input = TicketUpdateManyInputSchema.parse(rawInput);
	const batchId = ulid();
	const planner = changePlanner(ctx, tx, input);
	const applied: Applied[] = [];
	for (const ref of input.tickets) {
		const row = await resolveTicket(ctx, tx, ref);
		assertProjectActive(ctx, row.projectId);
		applied.push(await applyChanges(ctx, tx, batchId, row, input, planner));
	}
	return { items: await readAndEmit(ctx, tx, batchId, applied) };
};
