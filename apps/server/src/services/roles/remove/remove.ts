import { RoleIdInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../../context.ts";
import type { Tx } from "../../../db/tx.ts";
import { upsert } from "../../actors.ts";
import { read } from "../read";

export async function remove(ctx: ServiceCtx, tx: Tx, rawInput: unknown) {
	const input = RoleIdInputSchema.parse(rawInput);
	await upsert(ctx, tx, requireActor(ctx));
	await read(tx, input.id);
	await tx.execute(sql`DELETE FROM roles WHERE id = ${input.id}`);
	ctx.emit({ type: "roles.changed", id: input.id });
	return input;
}
