import { sql } from "drizzle-orm";
import type { Tx } from "../../tx.ts";
import { rows } from "../support.ts";
import { type HostRow, hostColumns } from "./hostRow.ts";

// A host in any state. A retired or revoked host keeps its row, so a
// historical reference still resolves to a name.
export const getHost = async (tx: Tx, input: { id: string }): Promise<HostRow | null> => {
	const found = await rows<HostRow>(tx, sql`SELECT ${hostColumns} FROM hosts h WHERE h.id = ${input.id}`);
	return found[0] ?? null;
};
