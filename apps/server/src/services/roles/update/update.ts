import { RoleUpdateInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../../context.ts";
import type { Tx } from "../../../db/tx.ts";
import { upsert } from "../../actors.ts";
import { read } from "../read";

export async function update(ctx: ServiceCtx, tx: Tx, rawInput: unknown) {
	const input = RoleUpdateInputSchema.parse(rawInput);
	await upsert(ctx, tx, requireActor(ctx));
	const existing = await read(tx, input.id);
	await tx.execute(
		sql`UPDATE roles SET name = ${input.name ?? existing.name}, body = ${input.body ?? existing.body}, updated_at = ${ctx.now} WHERE id = ${input.id}`,
	);
	ctx.emit({ type: "roles.changed", id: input.id });
	return read(tx, input.id);
}
