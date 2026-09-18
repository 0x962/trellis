import {
	type Epic,
	EpicCreateInputSchema,
	EpicDeleteInputSchema,
	type EpicDeleteOutput,
	EpicListInputSchema,
	EpicRefInputSchema,
	type EpicSummary,
	EpicUpdateInputSchema,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { requireActor, type ServiceCtx } from "../../context.ts";
import { rows, textArray } from "../../db/queries/support.ts";
import { epicSummaries } from "../../db/queries/ticketGet.ts";
import { ticketSummaries } from "../../db/queries/ticketSummaries.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import { record } from "../activity.ts";
import { upsert } from "../actors.ts";
import { assertProjectActive, pathOf, resolveProject } from "../refs.ts";
import { deriveSlug } from "../slug.ts";
import { assertAgentMayDelete } from "../tickets/rules.ts";
import { resolveEpic } from "./resolve.ts";
import { epicOrder, epicRefOf, epicSelect, type RawEpic, toEpicSummary } from "./rows.ts";

// An epic groups the tickets of one plan inside a project. The record holds
// the name, the slug, and the plan as markdown. The counts and the state
// come from the tickets that point at the epic, so a ticket write changes
// them and no epic row changes with it.

const byId = async (tx: Tx, id: string) => {
	const [row] = await rows<RawEpic>(tx, sql`${epicSelect} WHERE e.id = ${id}`);
	return row as RawEpic;
};

// The `epics.get` shape: the summary and every ticket of the epic in
// ticket number order.
export const epicView = async (ctx: ServiceCtx, tx: Tx, id: string): Promise<Epic> => {
	const row = await byId(tx, id);
	return { ...toEpicSummary(row, pathOf(ctx.cache, row.project_id)), tickets: await epicSummaries(tx, id) };
};

// Two epics of one root never share a slug. The unique constraint holds the
// same rule; this check turns the violation into DUPLICATE before the
// statement runs.
const assertSlugFree = async (tx: Tx, rootId: string, slug: string, exceptId: string | null) => {
	const taken = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM epics WHERE root_id = ${rootId} AND slug = ${slug} AND id IS DISTINCT FROM ${exceptId}`,
	);
	if (taken.length > 0) throw fail("DUPLICATE", { field: "slug" });
};

// A slug derived from the name takes the lowest free numeric suffix, from 2,
// when another epic of the root holds the plain form.
const freeSlug = async (tx: Tx, rootId: string, base: string) => {
	const found = await rows<{ slug: string }>(
		tx,
		sql`SELECT slug FROM epics WHERE root_id = ${rootId} AND (slug = ${base} OR slug LIKE ${`${base}-%`})`,
	);
	const taken = new Set(found.map((row) => row.slug));
	if (!taken.has(base)) return base;
	let suffix = 2;
	while (taken.has(`${base}-${suffix}`)) suffix += 1;
	return `${base}-${suffix}`;
};

export const list = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<EpicSummary[]> => {
	const input = EpicListInputSchema.parse(rawInput);
	const project = await resolveProject(ctx, tx, input.project);
	const ids = ctx.cache.resolveSubtree(project.id);
	const found = await rows<RawEpic>(
		tx,
		sql`${epicSelect} WHERE e.project_id = ANY(${textArray(ids)}) ORDER BY ${epicOrder}`,
	);
	return found.map((row) => toEpicSummary(row, pathOf(ctx.cache, row.project_id)));
};

export const get = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<Epic> => {
	const input = EpicRefInputSchema.parse(rawInput);
	const row = await resolveEpic(ctx, tx, input.epic);
	return epicView(ctx, tx, row.id);
};

export const create = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<Epic> => {
	const input = EpicCreateInputSchema.parse(rawInput);
	const project = await resolveProject(ctx, tx, input.project);
	assertProjectActive(ctx, project.id);
	const actor = requireActor(ctx);
	await upsert(ctx, tx, actor);
	let slug: string;
	if (input.slug === undefined) slug = await freeSlug(tx, project.rootId, deriveSlug(input.name));
	else {
		await assertSlugFree(tx, project.rootId, input.slug, null);
		slug = input.slug;
	}
	const id = ulid();
	await tx.execute(
		sql`INSERT INTO epics (id, project_id, root_id, slug, name, description, actor_name, actor_kind, created_at, updated_at)
			VALUES (${id}, ${project.id}, ${project.rootId}, ${slug}, ${input.name}, ${input.description ?? ""},
				${actor.name}, ${actor.kind}, ${ctx.now}, ${ctx.now})`,
	);
	ctx.emit({ type: "epics.changed", projectId: project.id, id });
	return epicView(ctx, tx, id);
};

// A field that the input omits keeps its value. The writer of the update
// becomes the actor of the epic.
export const update = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<Epic> => {
	const input = EpicUpdateInputSchema.parse(rawInput);
	const existing = await resolveEpic(ctx, tx, input.epic);
	assertProjectActive(ctx, existing.project_id);
	const actor = requireActor(ctx);
	await upsert(ctx, tx, actor);
	if (input.slug !== undefined) await assertSlugFree(tx, existing.root_id, input.slug, existing.id);
	await tx.execute(
		sql`UPDATE epics SET name = ${input.name ?? existing.name}, slug = ${input.slug ?? existing.slug},
			description = ${input.description ?? existing.description},
			actor_name = ${actor.name}, actor_kind = ${actor.kind}, updated_at = ${ctx.now} WHERE id = ${existing.id}`,
	);
	ctx.emit({ type: "epics.changed", projectId: existing.project_id, id: existing.id });
	return epicView(ctx, tx, existing.id);
};

// The foreign key sets `epic_id` NULL on every ticket of the epic when the
// row goes. Each of those tickets is a changed ticket: its version rises,
// one activity row names the epic it left, and one `ticket.updated` event
// carries its new summary.
export const remove = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<EpicDeleteOutput> => {
	const input = EpicDeleteInputSchema.parse(rawInput);
	assertAgentMayDelete(ctx, input.force);
	const existing = await resolveEpic(ctx, tx, input.epic);
	assertProjectActive(ctx, existing.project_id);
	const actor = requireActor(ctx);
	await upsert(ctx, tx, actor);
	const members = await rows<{ id: string; project_id: string }>(
		tx,
		sql`SELECT id, project_id FROM tickets WHERE epic_id = ${existing.id} ORDER BY number`,
	);
	await tx.execute(sql`DELETE FROM epics WHERE id = ${existing.id}`);
	const ids = members.map((member) => member.id);
	await tx.execute(
		sql`UPDATE tickets SET version = version + 1, updated_at = ${ctx.now} WHERE id = ANY(${textArray(ids)})`,
	);
	const batchId = ulid();
	const ref = epicRefOf(existing);
	for (const member of members) {
		await record(ctx, tx, {
			rootId: existing.root_id,
			projectId: member.project_id,
			ticketId: member.id,
			action: "ticket.updated",
			batchId,
			changes: [{ field: "epic", from: ref, to: null, meta: { fromId: existing.id, toId: null } }],
		});
	}
	for (const summary of await ticketSummaries(tx, ids)) {
		ctx.emit({ type: "ticket.updated", summary, fields: ["epic"], batchId });
	}
	ctx.emit({ type: "epics.changed", projectId: existing.project_id, id: existing.id });
	return { id: existing.id };
};
