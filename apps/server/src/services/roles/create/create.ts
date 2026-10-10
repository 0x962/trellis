import { RoleCreateInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { requireActor, type ServiceCtx } from "../../../context.ts";
import type { Tx } from "../../../db/tx.ts";
import { upsert } from "../../actors.ts";
import { read } from "../read";

export async function create(ctx: ServiceCtx, tx: Tx, rawInput: unknown) {
	const input = RoleCreateInputSchema.parse(rawInput);
	await upsert(ctx, tx, requireActor(ctx));
	const id = ulid();
	await tx.execute(
		sql`INSERT INTO roles (id, name, body, created_at, updated_at) VALUES (${id}, ${input.name}, ${input.body}, ${ctx.now}, ${ctx.now})`,
	);
	ctx.emit({ type: "roles.changed", id });
	return read(tx, id);
}
