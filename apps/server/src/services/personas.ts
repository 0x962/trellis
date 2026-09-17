import type { Persona, PersonaCreateInput, PersonaUpdateInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { requireActor, type ServiceCtx } from "../context.ts";
import { iso, rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { fail, invalidInput } from "../errors.ts";
import { upsert } from "./actors.ts";

const columns = sql`id, name, kind, instruction,
	${iso(sql`created_at`)} AS "createdAt", ${iso(sql`updated_at`)} AS "updatedAt"`;

export const list = (_ctx: ServiceCtx, tx: Tx, _input: Record<string, never>): Promise<Persona[]> =>
	rows<Persona>(tx, sql`SELECT ${columns} FROM personas ORDER BY name, id`);

export const get = async (_ctx: ServiceCtx, tx: Tx, input: { id: string }): Promise<Persona> => {
	const [persona] = await rows<Persona>(tx, sql`SELECT ${columns} FROM personas WHERE id = ${input.id}`);
	if (persona === undefined) throw fail("NOT_FOUND", { kind: "persona", ref: input.id });
	return persona;
};

export const create = async (ctx: ServiceCtx, tx: Tx, input: PersonaCreateInput): Promise<Persona> => {
	const actor = requireActor(ctx);
	await upsert(ctx, tx, actor);
	const [persona] = await rows<Persona>(
		tx,
		sql`INSERT INTO personas (id, name, kind, instruction, created_at, updated_at)
			VALUES (${ulid()}, ${input.name}, ${input.kind ?? "builder"}, ${input.instruction}, ${ctx.now}, ${ctx.now}) RETURNING ${columns}`,
	);
	ctx.emit({ type: "personas.changed", id: persona!.id });
	return persona!;
};

const assertNotConfigured = async (tx: Tx, id: string) => {
	const configured = await rows(
		tx,
		sql`SELECT id FROM statuses WHERE agent_config->>'personaId'=${id} UNION ALL SELECT id FROM projects WHERE manager_config->>'personaId'=${id} LIMIT 1`,
	);
	if (configured.length > 0)
		throw invalidInput(
			"id",
			"Select another persona in the column or copilot settings before you delete this persona or change its kind.",
		);
};

export const update = async (ctx: ServiceCtx, tx: Tx, input: PersonaUpdateInput): Promise<Persona> => {
	const actor = requireActor(ctx);
	if (input.kind !== undefined && input.kind !== (await get(ctx, tx, { id: input.id })).kind)
		await assertNotConfigured(tx, input.id);
	const [persona] = await rows<Persona>(
		tx,
		sql`UPDATE personas SET name = ${input.name}, kind = COALESCE(${input.kind ?? null}, kind), instruction = ${input.instruction}, updated_at = ${ctx.now}
			WHERE id = ${input.id} RETURNING ${columns}`,
	);
	if (persona === undefined) throw fail("NOT_FOUND", { kind: "persona", ref: input.id });
	await upsert(ctx, tx, actor);
	ctx.emit({ type: "personas.changed", id: persona.id });
	return persona;
};

export const remove = async (ctx: ServiceCtx, tx: Tx, input: { id: string }) => {
	const actor = requireActor(ctx);
	await assertNotConfigured(tx, input.id);
	const [deleted] = await rows<{ id: string }>(tx, sql`DELETE FROM personas WHERE id = ${input.id} RETURNING id`);
	if (deleted === undefined) throw fail("NOT_FOUND", { kind: "persona", ref: input.id });
	await upsert(ctx, tx, actor);
	ctx.emit({ type: "personas.changed", id: deleted.id });
	return deleted;
};
