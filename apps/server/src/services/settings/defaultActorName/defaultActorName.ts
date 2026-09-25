import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../context.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { defaults } from "../settings.ts";

export const defaultActorName = async (_ctx: ServiceCtx, tx: Tx) => {
	const found = await rows<{ value: string }>(tx, sql`SELECT value FROM settings WHERE key = 'defaultActorName'`);
	return { name: found.length ? found[0]!.value : defaults().defaultActorName, stored: found.length > 0 };
};
