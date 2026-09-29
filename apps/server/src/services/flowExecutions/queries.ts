import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import { normalizeDoc } from "../legacyFlowHistory/normalizeDoc.ts";
import type { StoredExecution } from "./types.ts";

export { get, getMany } from "../legacyFlowHistory/queries.ts";

export const readExecution = async (tx: Tx, id: string, lock = false) => {
	const [row] = await rows<StoredExecution>(
		tx,
		sql`SELECT * FROM flow_executions WHERE id=${id} ${lock ? sql`FOR UPDATE` : sql``}`,
	);
	if (!row) throw fail("NOT_FOUND", { kind: "flow execution", ref: id });
	return { ...row, doc: normalizeDoc(row.doc) };
};
