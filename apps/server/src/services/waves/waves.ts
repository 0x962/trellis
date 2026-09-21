import {
	WaveCreateInputSchema,
	WaveDeleteInputSchema,
	type WaveDeleteOutput,
	WaveReorderInputSchema,
	type WaveSummary,
	WaveUpdateInputSchema,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { requireActor, type ServiceCtx } from "../../context.ts";
import { rows, textArray } from "../../db/queries/support.ts";
import { ticketSummaries } from "../../db/queries/ticketSummaries.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import { record } from "../activity.ts";
import { resolveEpic } from "../epics/resolve.ts";
import { assertProjectActive } from "../refs.ts";
import { deriveSlug } from "../slug.ts";
import { assertAgentMayDelete } from "../tickets/rules.ts";
import { resolveWave } from "./resolve.ts";
import { type RawWave, toWaveSummary, waveOrder, waveRefOf, waveSelect } from "./rows.ts";

// A wave is one ordered phase of an epic. The record holds the name,
// the slug, and the position. The counts and the state come from the tickets
// that point at the wave, so a ticket write changes them and no
// wave row changes with it. Every write here emits `epics.changed`
// with the epic of the wave, because `epics.get` carries the waves
// and every ticket row copies the wave name and ref.

// The waves of one epic in position order.
export const wavesOf = async (tx: Tx, epicId: string): Promise<WaveSummary[]> => {
	const found = await rows<RawWave>(tx, sql`${waveSelect} WHERE m.epic_id = ${epicId} ORDER BY ${waveOrder}`);
	return found.map(toWaveSummary);
};

const byId = async (tx: Tx, id: string) => {
	const [row] = await rows<RawWave>(tx, sql`${waveSelect} WHERE m.id = ${id}`);
	return toWaveSummary(row as RawWave);
};

// Two waves of one epic never share a slug. The unique constraint holds
// the same rule; this check turns the violation into DUPLICATE before the
// statement runs.
const assertSlugFree = async (tx: Tx, epicId: string, slug: string, exceptId: string | null) => {
	const taken = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM waves WHERE epic_id = ${epicId} AND slug = ${slug} AND id IS DISTINCT FROM ${exceptId}`,
	);
	if (taken.length > 0) throw fail("DUPLICATE", { field: "slug" });
};

// A slug derived from the name takes the lowest free numeric suffix, from 2,
// when another wave of the epic holds the plain form.
const freeSlug = async (tx: Tx, epicId: string, base: string) => {
	const found = await rows<{ slug: string }>(
		tx,
		sql`SELECT slug FROM waves WHERE epic_id = ${epicId} AND (slug = ${base} OR slug LIKE ${`${base}-%`})`,
	);
	const taken = new Set(found.map((row) => row.slug));
	if (!taken.has(base)) return base;
	let suffix = 2;
	while (taken.has(`${base}-${suffix}`)) suffix += 1;
	return `${base}-${suffix}`;
};

// The new wave takes the position after the last wave of the epic.
export const create = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<WaveSummary> => {
	const input = WaveCreateInputSchema.parse(rawInput);
	const epic = await resolveEpic(ctx, tx, input.epic);
	assertProjectActive(ctx, epic.project_id);
	requireActor(ctx);
	let slug: string;
	if (input.slug === undefined) slug = await freeSlug(tx, epic.id, deriveSlug(input.name));
	else {
		await assertSlugFree(tx, epic.id, input.slug, null);
		slug = input.slug;
	}
	const id = ulid();
	await tx.execute(
		sql`INSERT INTO waves (id, epic_id, root_id, slug, name, position, created_at, updated_at)
			VALUES (${id}, ${epic.id}, ${epic.root_id}, ${slug}, ${input.name},
				(SELECT coalesce(max(position) + 1, 0) FROM waves WHERE epic_id = ${epic.id}),
				${ctx.now}, ${ctx.now})`,
	);
	ctx.emit({ type: "epics.changed", projectId: epic.project_id, id: epic.id });
	return byId(tx, id);
};

// A field that the input omits keeps its value.
export const update = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<WaveSummary> => {
	const input = WaveUpdateInputSchema.parse(rawInput);
	const existing = await resolveWave(ctx, tx, input.wave);
	assertProjectActive(ctx, existing.epic_project_id);
	requireActor(ctx);
	if (input.slug !== undefined) await assertSlugFree(tx, existing.epic_id, input.slug, existing.id);
	await tx.execute(
		sql`UPDATE waves SET name = ${input.name ?? existing.name}, slug = ${input.slug ?? existing.slug},
			updated_at = ${ctx.now} WHERE id = ${existing.id}`,
	);
	ctx.emit({ type: "epics.changed", projectId: existing.epic_project_id, id: existing.epic_id });
	return byId(tx, existing.id);
};

// Takes every wave of the epic once, in the new order, and writes the
// positions 0 to n minus 1. A list that omits a wave, repeats one, or
// names a wave of another epic is WAVE_OUTSIDE_EPIC.
export const reorder = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<WaveSummary[]> => {
	const input = WaveReorderInputSchema.parse(rawInput);
	const epic = await resolveEpic(ctx, tx, input.epic);
	assertProjectActive(ctx, epic.project_id);
	requireActor(ctx);
	const ids: string[] = [];
	for (const ref of input.waves) {
		const wave = await resolveWave(ctx, tx, ref);
		if (wave.epic_id !== epic.id) throw fail("WAVE_OUTSIDE_EPIC");
		ids.push(wave.id);
	}
	const current = await wavesOf(tx, epic.id);
	if (ids.length !== current.length || new Set(ids).size !== ids.length) throw fail("WAVE_OUTSIDE_EPIC");
	await tx.execute(
		sql`UPDATE waves m SET position = (o.ordinality - 1)::int
			FROM unnest(${textArray(ids)}) WITH ORDINALITY AS o(id, ordinality) WHERE m.id = o.id`,
	);
	ctx.emit({ type: "epics.changed", projectId: epic.project_id, id: epic.id });
	return wavesOf(tx, epic.id);
};

// The foreign key sets `wave_id` NULL on every ticket of the wave
// when the row goes, and each of those tickets stays in its epic. Each one
// is a changed ticket: its version rises, one activity row names the
// wave it left, and one `ticket.updated` event carries its new summary.
export const remove = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<WaveDeleteOutput> => {
	const input = WaveDeleteInputSchema.parse(rawInput);
	assertAgentMayDelete(ctx, input.force);
	const existing = await resolveWave(ctx, tx, input.wave);
	assertProjectActive(ctx, existing.epic_project_id);
	const members = await rows<{ id: string; project_id: string }>(
		tx,
		sql`SELECT id, project_id FROM tickets WHERE wave_id = ${existing.id} ORDER BY number`,
	);
	await tx.execute(sql`DELETE FROM waves WHERE id = ${existing.id}`);
	const ids = members.map((member) => member.id);
	await tx.execute(
		sql`UPDATE tickets SET version = version + 1, updated_at = ${ctx.now} WHERE id = ANY(${textArray(ids)})`,
	);
	const batchId = ulid();
	const ref = waveRefOf(existing);
	for (const member of members) {
		await record(ctx, tx, {
			rootId: existing.root_id,
			projectId: member.project_id,
			ticketId: member.id,
			action: "ticket.updated",
			batchId,
			changes: [{ field: "wave", from: ref, to: null, meta: { fromId: existing.id, toId: null } }],
		});
	}
	for (const summary of await ticketSummaries(tx, ids)) {
		ctx.emit({ type: "ticket.updated", summary, fields: ["wave"], batchId });
	}
	ctx.emit({ type: "epics.changed", projectId: existing.epic_project_id, id: existing.epic_id });
	return { id: existing.id };
};
