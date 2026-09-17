import {
	type Note,
	type NoteAudience,
	NoteCreateInputSchema,
	NoteIdInputSchema,
	NoteListInputSchema,
	NoteUpdateInputSchema,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { requireActor, type ServiceCtx } from "../../context.ts";
import { rows, textArray } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import { upsert } from "../actors.ts";
import { assertProjectActive, chainOf, pathOf, resolveProject } from "../refs.ts";
import { noteSelect, type RawNote, toNote } from "./rows.ts";

// A note that is written on a project reaches that project and every
// project below it, so a read collects the notes of the project and of every
// ancestor. Newest change first: the first note is the most recent state.

const toNotes = (ctx: ServiceCtx, found: RawNote[]) =>
	found.map((row) => toNote(row, pathOf(ctx.cache, row.project_id)));

const byId = async (tx: Tx, id: string) => {
	const [row] = await rows<RawNote>(tx, sql`${noteSelect} WHERE n.id = ${id}`);
	if (row === undefined) throw fail("NOT_FOUND", { kind: "note", ref: id });
	return row;
};

// Two notes of one project never share a title, compared without case. The
// unique index holds the same rule; this check turns the violation into
// DUPLICATE before the statement runs.
const assertTitleFree = async (tx: Tx, projectId: string, title: string, exceptId: string | null) => {
	const taken = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM notes WHERE project_id = ${projectId} AND lower(title) = lower(${title}) AND id <> ${exceptId ?? ""}`,
	);
	if (taken.length > 0) throw fail("DUPLICATE", { field: "title" });
};

// The notes an agent of `projectId` reads at start: for `audience` and for
// `all`, and not expired at the instant of the context.
export const activeNotes = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: { projectId: string; audience: Exclude<NoteAudience, "all"> },
): Promise<Note[]> => {
	const ids = chainOf(ctx.cache, input.projectId).map((project) => project.id);
	const found = await rows<RawNote>(
		tx,
		sql`${noteSelect} WHERE n.project_id = ANY(${textArray(ids)}) AND n.audience IN ('all', ${input.audience})
			AND (n.expires_at IS NULL OR n.expires_at > ${ctx.now}) ORDER BY n.updated_at DESC, n.id DESC`,
	);
	return toNotes(ctx, found);
};

export const list = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<Note[]> => {
	const input = NoteListInputSchema.parse(rawInput);
	const project = await resolveProject(ctx, tx, input.project);
	const ids = chainOf(ctx.cache, project.id).map((item) => item.id);
	const found = await rows<RawNote>(
		tx,
		sql`${noteSelect} WHERE n.project_id = ANY(${textArray(ids)})
			AND ${input.audience === undefined ? sql`true` : sql`n.audience IN ('all', ${input.audience})`}
			AND ${input.includeExpired ? sql`true` : sql`(n.expires_at IS NULL OR n.expires_at > ${ctx.now})`}
			ORDER BY n.updated_at DESC, n.id DESC`,
	);
	return toNotes(ctx, found);
};

export const get = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<Note> => {
	const input = NoteIdInputSchema.parse(rawInput);
	const row = await byId(tx, input.id);
	return toNote(row, pathOf(ctx.cache, row.project_id));
};

export const create = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<Note> => {
	const input = NoteCreateInputSchema.parse(rawInput);
	const project = await resolveProject(ctx, tx, input.project);
	assertProjectActive(ctx, project.id);
	const actor = requireActor(ctx);
	await upsert(ctx, tx, actor);
	await assertTitleFree(tx, project.id, input.title, null);
	const id = ulid();
	await tx.execute(
		sql`INSERT INTO notes (id, project_id, title, body, audience, expires_at, actor_name, actor_kind, created_at, updated_at)
			VALUES (${id}, ${project.id}, ${input.title}, ${input.body}, ${input.audience}, ${input.expiresAt}, ${actor.name}, ${actor.kind}, ${ctx.now}, ${ctx.now})`,
	);
	ctx.emit({ type: "notes.changed", projectId: project.id });
	return toNote(await byId(tx, id), pathOf(ctx.cache, project.id));
};

// A field that the input omits keeps its value. `expiresAt: null` clears the
// expiry. The writer of the update becomes the actor of the note.
export const update = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<Note> => {
	const input = NoteUpdateInputSchema.parse(rawInput);
	const existing = await byId(tx, input.id);
	assertProjectActive(ctx, existing.project_id);
	const actor = requireActor(ctx);
	await upsert(ctx, tx, actor);
	if (input.title !== undefined) await assertTitleFree(tx, existing.project_id, input.title, existing.id);
	await tx.execute(
		sql`UPDATE notes SET title = ${input.title ?? existing.title}, body = ${input.body ?? existing.body},
			audience = ${input.audience ?? existing.audience},
			expires_at = ${input.expiresAt === undefined ? existing.expires_at : input.expiresAt},
			actor_name = ${actor.name}, actor_kind = ${actor.kind}, updated_at = ${ctx.now} WHERE id = ${existing.id}`,
	);
	ctx.emit({ type: "notes.changed", projectId: existing.project_id });
	return toNote(await byId(tx, existing.id), pathOf(ctx.cache, existing.project_id));
};

export const remove = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown) => {
	const input = NoteIdInputSchema.parse(rawInput);
	const existing = await byId(tx, input.id);
	assertProjectActive(ctx, existing.project_id);
	const actor = requireActor(ctx);
	await upsert(ctx, tx, actor);
	await tx.execute(sql`DELETE FROM notes WHERE id = ${existing.id}`);
	ctx.emit({ type: "notes.changed", projectId: existing.project_id });
	return { id: existing.id };
};
