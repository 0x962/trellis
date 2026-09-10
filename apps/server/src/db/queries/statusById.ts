import { sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";
import { type StatusRow, statusColumns, toStatus } from "./effectiveStatuses.ts";
import { rows } from "./support.ts";

// One status by id. The caller holds the id from a ticket row, so it exists.
export const statusById = async (tx: Tx, id: string): Promise<StatusRow> => {
	const found = await rows<Parameters<typeof toStatus>[0]>(
		tx,
		sql`SELECT ${statusColumns} FROM statuses s WHERE s.id = ${id}`,
	);
	return toStatus(found[0] as Parameters<typeof toStatus>[0]);
};
