import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";

export const keyOf = async (tx: Tx, id: string): Promise<string> => {
	const [provider] = await rows<{ api_key: string }>(tx, sql`SELECT api_key FROM providers WHERE id = ${id}`);
	if (provider === undefined) throw fail("NOT_FOUND", { kind: "provider", ref: id });
	return provider.api_key;
};
