import { sql } from "drizzle-orm";
import type { Tx } from "../../tx.ts";
import { rows } from "../support.ts";
import { type HostRow, hostColumns } from "./hostRow.ts";

// The one host with `local = true`. The migration 0152 inserts it, and the
// partial unique index `hosts_local_idx` keeps it the only one.
export const localHost = async (tx: Tx): Promise<HostRow> => {
	const found = await rows<HostRow>(tx, sql`SELECT ${hostColumns} FROM hosts h WHERE h.local`);
	return found[0]!;
};
