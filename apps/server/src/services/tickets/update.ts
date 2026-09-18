import {
	type Priority,
	type Ticket,
	TicketUpdateInputSchema,
	TicketUpdateManyInputSchema,
	type TicketUpdateManyOutputSchema,
} from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { z } from "zod";
import type { ServiceCtx } from "../../context.ts";
import { effectiveStatuses } from "../../db/queries/effectiveStatuses.ts";
import { statusById } from "../../db/queries/statusById.ts";
import { rows } from "../../db/queries/support.ts";
import { ticketGet, ticketSummary } from "../../db/queries/ticketGet.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import { record } from "../activity.ts";
import { resolveEpicForTicket } from "../epics/resolve.ts";
import { epicRefOf } from "../epics/rows.ts";
import { assertProjectActive, pathOf, resolveProject, resolveStatus, resolveTicket, type TicketRow } from "../refs.ts";
import { applyLabelDeltas } from "./labels.ts";
import { assertVersion, outsideRoot, remapStatus, stampColumns } from "./rules.ts";

// The fields `update` and `updateMany` share. A ref is a canonical string;
// `parent: null` clears the parent, and `epic: null` clears the epic.
type ChangeInput = {
	title?: string;
	description?: string;
	priority?: Priority;
	status?: string;
	parent?: string | null;
	epic?: string | null;
	project?: string;
	addLabels?: readonly string[];
	removeLabels?: readonly string[];
	force?: boolean;
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

// A parent must sit in the same root and must not be the ticket or one of
// its descendants. The walk down the children stops at depth 64.
const resolveParent = async (ctx: ServiceCtx, tx: Tx, row: TicketRow, ref: string) => {
	const parent = await resolveTicket(ctx, tx, ref);
	if (outsideRoot(parent, row.rootId)) throw fail("CROSS_ROOT_MOVE");
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

const projectAndStatusChanges = async (ctx: ServiceCtx, tx: Tx, row: TicketRow, input: ChangeInput) => {
	const changes: FieldChange[] = [];
	let projectId = row.projectId;
	if (input.project !== undefined) {
		const project = await resolveProject(ctx, tx, input.project);
		if (project.id !== row.projectId) {
			if (project.rootId !== row.rootId) throw fail("CROSS_ROOT_MOVE");
			assertProjectActive(ctx, project.id);
			projectId = project.id;
			changes.push({
				field: "project",
				from: pathOf(ctx.cache, row.projectId),
				to: pathOf(ctx.cache, project.id),
				meta: { fromId: row.projectId, toId: project.id },
				set: sql`project_id = ${project.id}`,
			});
		}
	}
	const current = await statusById(tx, row.statusId);
	let next = current;
	if (input.status !== undefined) {
		next = await resolveStatus(ctx, tx, { projectId, status: input.status });
	} else if (projectId !== row.projectId) {
		const target = await effectiveStatuses(tx, projectId);
		if (!target.some((status) => status.id === current.id)) next = remapStatus(target, current);
	}
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

// Applies `input` to one ticket under `batchId`: one UPDATE, one activity
// row per changed field, one ticket.updated event. An input that changes
// nothing writes nothing. Returns the summary after the write.
export const applyChanges = async (ctx: ServiceCtx, tx: Tx, batchId: string, row: TicketRow, input: ChangeInput) => {
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
	if (input.epic !== undefined) {
		const epic = input.epic === null ? null : await resolveEpicForTicket(ctx, tx, row.rootId, input.epic);
		if ((epic?.id ?? null) !== row.epicId) {
			changes.push({
				field: "epic",
				from: row.epicRef,
				to: epic === null ? null : epicRefOf(epic),
				meta: { fromId: row.epicId, toId: epic?.id ?? null },
				set: sql`epic_id = ${epic?.id ?? null}`,
			});
		}
	}
	changes.push(...(await projectAndStatusChanges(ctx, tx, row, input)));
	changes.push(...(await applyLabelDeltas(ctx, tx, row, input)));
	if (changes.length === 0) return ticketSummary(tx, row.id);

	// A write that changes labels alone has no column to set, and it still
	// raises `version`, so every client sees that the row changed.
	const sets = changes.flatMap((change) => (change.set === undefined ? [] : [change.set]));
	await tx.execute(
		sql`UPDATE tickets
			SET ${sql.join([...sets, sql`version = version + 1`, sql`updated_at = ${ctx.now}`], sql`, `)}
			WHERE id = ${row.id}`,
	);
	await record(ctx, tx, {
		rootId: row.rootId,
		projectId: row.projectId,
		ticketId: row.id,
		action: "ticket.updated",
		batchId,
		changes: changes.map(({ field, from, to, meta }) => ({ field, from, to, meta })),
	});
	const summary = await ticketSummary(tx, row.id);
	const fields = [...new Set(changes.map((change) => change.field))];
	ctx.emit({ type: "ticket.updated", summary, fields, batchId });
	return summary;
};

export const update = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<Ticket> => {
	const input = TicketUpdateInputSchema.parse(rawInput);
	const row = await resolveTicket(ctx, tx, input.ticket);
	assertProjectActive(ctx, row.projectId);
	await assertVersion(tx, row, input.expectedVersion);
	await applyChanges(ctx, tx, ulid(), row, input);
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
	const items = [];
	for (const ref of input.tickets) {
		const row = await resolveTicket(ctx, tx, ref);
		assertProjectActive(ctx, row.projectId);
		items.push(await applyChanges(ctx, tx, batchId, row, input));
	}
	return { items };
};
