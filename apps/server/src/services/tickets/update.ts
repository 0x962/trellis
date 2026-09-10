import {
	type Priority,
	type Ticket,
	TicketUpdateInputSchema,
	TicketUpdateManyInputSchema,
	type TicketUpdateManyOutputSchema,
} from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import type { z } from "zod";
import type { Ctx } from "../../context.ts";
import { effectiveStatuses } from "../../db/queries/effectiveStatuses.ts";
import { statusById } from "../../db/queries/statusById.ts";
import { rows } from "../../db/queries/support.ts";
import { ticketGet, ticketSummary } from "../../db/queries/ticketGet.ts";
import type { Tx } from "../../db/tx.ts";
import { type Batch, beginBatch } from "../activity.ts";
import { contractError } from "../errors.ts";
import { resolveProject, resolveStatus, resolveTicket, type TicketRow } from "../refs.ts";
import {
	assertAgentMayComplete,
	assertProjectOpen,
	assertVersion,
	outsideRoot,
	remapStatus,
	stampColumns,
} from "./rules.ts";

// The fields `update` and `updateMany` share. A ref is a canonical string;
// `parent: null` clears the parent; `force` lets an agent reach a done status.
type ChangeInput = {
	title?: string;
	description?: string;
	priority?: Priority;
	status?: string;
	parent?: string | null;
	project?: string;
	force?: boolean;
};

// One changed field: its activity row and its SET clause.
type Change = {
	field: string;
	from: string | null;
	to: string | null;
	meta?: Record<string, unknown>;
	set: SQL;
};

// A parent must sit in the same root and must not be the ticket or one of
// its descendants. The walk down the children stops at depth 64.
const resolveParent = async (ctx: Ctx, tx: Tx, row: TicketRow, ref: string) => {
	const parent = await resolveTicket(ctx, tx, ref);
	if (outsideRoot(parent, row.root_id)) throw contractError("CROSS_ROOT_MOVE", undefined);
	if (parent.id === row.id) throw contractError("PARENT_CYCLE", undefined);
	const below = await rows<{ id: string }>(
		tx,
		sql`WITH RECURSIVE down AS (
			SELECT id, 0 AS depth FROM tickets WHERE parent_id = ${row.id}
			UNION ALL
			SELECT t.id, down.depth + 1 FROM tickets t JOIN down ON t.parent_id = down.id WHERE down.depth < 64
		)
		SELECT id FROM down WHERE id = ${parent.id} LIMIT 1`,
	);
	if (below.length > 0) throw contractError("PARENT_CYCLE", undefined);
	return parent;
};

// A second description edit by the same actor inside 5 minutes of the last
// one writes no row: an editor that autosaves would flood the timeline.
const recentDescriptionRow = async (tx: Tx, row: TicketRow, batch: Batch) => {
	const found = await rows<{ id: number }>(
		tx,
		sql`SELECT id FROM activity WHERE ticket_id = ${row.id} AND field = 'description'
			AND actor_name = ${batch.actor.name} AND actor_kind = ${batch.actor.kind}
			AND created_at > ${batch.now}::timestamptz - interval '5 minutes' LIMIT 1`,
	);
	return found.length > 0;
};

const projectAndStatusChanges = async (ctx: Ctx, tx: Tx, batch: Batch, row: TicketRow, input: ChangeInput) => {
	const changes: Change[] = [];
	let projectId = row.project_id;
	if (input.project !== undefined) {
		const project = await resolveProject(ctx, tx, input.project);
		if (project.id !== row.project_id) {
			if (project.rootId !== row.root_id) throw contractError("CROSS_ROOT_MOVE", undefined);
			assertProjectOpen(project.archivedAt !== null);
			projectId = project.id;
			changes.push({
				field: "project",
				from: row.project_path,
				to: project.path,
				meta: { fromId: row.project_id, toId: project.id },
				set: sql`project_id = ${project.id}`,
			});
		}
	}
	const current = await statusById(tx, row.status_id);
	let next = current;
	if (input.status !== undefined) {
		next = await resolveStatus(ctx, tx, { projectId, status: input.status });
	} else if (projectId !== row.project_id) {
		const target = await effectiveStatuses(tx, projectId);
		if (!target.some((status) => status.id === current.id)) next = remapStatus(target, current);
	}
	if (next.id !== current.id) {
		assertAgentMayComplete(ctx, next, input.force);
		changes.push({
			field: "status",
			from: current.name,
			to: next.name,
			meta: { fromId: current.id, toId: next.id, fromCategory: current.category, toCategory: next.category },
			set: sql`status_id = ${next.id}, ${stampColumns(next.category, batch.now)}`,
		});
	}
	return changes;
};

// Applies `input` to one ticket under `batch`: one UPDATE, one activity row
// per changed field, one ticket.updated event. An input that changes
// nothing writes nothing. Returns the summary after the write.
export const applyChanges = async (ctx: Ctx, tx: Tx, batch: Batch, row: TicketRow, input: ChangeInput) => {
	const changes: Change[] = [];
	if (input.title !== undefined && input.title !== row.title) {
		changes.push({ field: "title", from: row.title, to: input.title, set: sql`title = ${input.title}` });
	}
	if (input.description !== undefined && input.description !== row.description) {
		changes.push({
			field: "description",
			from: null,
			to: null,
			meta: { deltaChars: input.description.length - row.description.length },
			set: sql`description = ${input.description}`,
		});
	}
	if (input.priority !== undefined && input.priority !== row.priority) {
		changes.push({ field: "priority", from: row.priority, to: input.priority, set: sql`priority = ${input.priority}` });
	}
	if (input.parent !== undefined) {
		const parent = input.parent === null ? null : await resolveParent(ctx, tx, row, input.parent);
		if ((parent?.id ?? null) !== row.parent_id) {
			changes.push({
				field: "parent",
				from: row.parent_identifier,
				to: parent?.identifier ?? null,
				meta: { fromId: row.parent_id, toId: parent?.id ?? null },
				set: sql`parent_id = ${parent?.id ?? null}`,
			});
		}
	}
	changes.push(...(await projectAndStatusChanges(ctx, tx, batch, row, input)));
	if (changes.length === 0) return ticketSummary(tx, row.id);

	const sets = changes.map((change) => change.set);
	await tx.execute(
		sql`UPDATE tickets SET ${sql.join(sets, sql`, `)}, version = version + 1, updated_at = ${batch.now}
			WHERE id = ${row.id}`,
	);
	for (const change of changes) {
		if (change.field === "description" && (await recentDescriptionRow(tx, row, batch))) continue;
		await batch.record({
			rootId: row.root_id,
			projectId: row.project_id,
			ticketId: row.id,
			action: "ticket.updated",
			field: change.field,
			fromValue: change.from,
			toValue: change.to,
			meta: change.meta,
		});
	}
	const summary = await ticketSummary(tx, row.id);
	ctx.emit({ type: "ticket.updated", summary, fields: changes.map((change) => change.field), batchId: batch.id });
	return summary;
};

export const update = async (ctx: Ctx, tx: Tx, rawInput: unknown): Promise<Ticket> => {
	const input = TicketUpdateInputSchema.parse(rawInput);
	const row = await resolveTicket(ctx, tx, input.ticket);
	assertProjectOpen(row.project_archived);
	await assertVersion(tx, row, input.expectedVersion);
	const batch = await beginBatch(ctx, tx);
	await applyChanges(ctx, tx, batch, row, input);
	return ticketGet(tx, row.id);
};

// One batch and one transaction for up to 200 tickets: a ref that misses or
// a rule that refuses rolls every ticket back.
export const updateMany = async (
	ctx: Ctx,
	tx: Tx,
	rawInput: unknown,
): Promise<z.infer<typeof TicketUpdateManyOutputSchema>> => {
	const input = TicketUpdateManyInputSchema.parse(rawInput);
	const batch = await beginBatch(ctx, tx);
	const items = [];
	for (const ref of input.tickets) {
		const row = await resolveTicket(ctx, tx, ref);
		assertProjectOpen(row.project_archived);
		items.push(await applyChanges(ctx, tx, batch, row, input));
	}
	return { items };
};
