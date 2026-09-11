import type { Persona, PersonaCreateInput, PersonaUpdateInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { requireActor, type ServiceCtx } from "../context.ts";
import { iso, rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";
import { upsert } from "./actors.ts";

const columns = sql`id, name, instruction,
	${iso(sql`created_at`)} AS "createdAt", ${iso(sql`updated_at`)} AS "updatedAt"`;

export const list = (_ctx: ServiceCtx, tx: Tx, _input: Record<string, never>): Promise<Persona[]> =>
	rows<Persona>(tx, sql`SELECT ${columns} FROM personas ORDER BY name, id`);

export const create = async (ctx: ServiceCtx, tx: Tx, input: PersonaCreateInput): Promise<Persona> => {
	const actor = requireActor(ctx);
	await upsert(ctx, tx, actor);
	const [persona] = await rows<Persona>(
		tx,
		sql`INSERT INTO personas (id, name, instruction, created_at, updated_at)
			VALUES (${ulid()}, ${input.name}, ${input.instruction}, ${ctx.now}, ${ctx.now}) RETURNING ${columns}`,
	);
	ctx.emit({ type: "personas.changed", id: persona!.id });
	return persona!;
};

export const update = async (ctx: ServiceCtx, tx: Tx, input: PersonaUpdateInput): Promise<Persona> => {
	const actor = requireActor(ctx);
	const [persona] = await rows<Persona>(
		tx,
		sql`UPDATE personas SET name = ${input.name}, instruction = ${input.instruction}, updated_at = ${ctx.now}
			WHERE id = ${input.id} RETURNING ${columns}`,
	);
	if (persona === undefined) throw fail("NOT_FOUND", { kind: "persona", ref: input.id });
	await upsert(ctx, tx, actor);
	ctx.emit({ type: "personas.changed", id: persona.id });
	return persona;
};
