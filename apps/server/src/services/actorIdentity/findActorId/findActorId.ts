import type { ActorRef } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../context.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";

export const findActorId = async (_ctx: ServiceCtx, tx: Tx, actor: ActorRef): Promise<string | null> => {
	const found = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM actors
			WHERE ARRAY[kind, name]::text[] = ARRAY[${actor.kind}, ${actor.name}]::text[]`,
	);
	return found[0]?.id ?? null;
};
