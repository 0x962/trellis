import { sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";
import { rows } from "./support.ts";

// The project and every descendant, parents first. The walk stops at depth
// 64, so a planted parent cycle ends the query.
export const subtreeIds = async (tx: Tx, projectId: string) => {
	const found = await rows<{ id: string }>(
		tx,
		sql`WITH RECURSIVE sub AS (
			SELECT id, 0 AS depth FROM projects WHERE id = ${projectId}
			UNION ALL
			SELECT p.id, sub.depth + 1 FROM projects p JOIN sub ON p.parent_id = sub.id
			WHERE sub.depth < 64
		)
		SELECT id FROM sub ORDER BY depth, id`,
	);
	return found.map((row) => row.id);
};
