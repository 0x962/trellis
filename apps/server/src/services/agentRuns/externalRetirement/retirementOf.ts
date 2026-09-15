import type { ExternalRetirement } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";

export const retirementOf = async (tx: Tx, source: "legacy" | "persona", id: string) => {
	const [row] = await rows<{ retirement: ExternalRetirement }>(
		tx,
		sql`SELECT meta->'retirement' AS retirement FROM activity WHERE action='agent.external-retired' AND meta->'retirement'->>'source'=${source} AND meta->'retirement'->>'id'=${id} ORDER BY id LIMIT 1`,
	);
	return row?.retirement ?? null;
};
