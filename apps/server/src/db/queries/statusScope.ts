import { sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";
import { rows } from "./support.ts";

// The projects whose tickets point at the statuses of `projectId`: the
// project itself and every descendant reached without crossing a project
// that owns its own statuses. The walk stops at depth 64.
export const statusScope = async (tx: Tx, projectId: string) => {
	const found = await rows<{ id: string }>(
		tx,
		sql`WITH RECURSIVE scope AS (
			SELECT id, 0 AS depth FROM projects WHERE id = ${projectId}
			UNION ALL
			SELECT p.id, scope.depth + 1
			FROM projects p JOIN scope ON p.parent_id = scope.id
			WHERE scope.depth < 64
				AND NOT EXISTS (SELECT 1 FROM statuses s WHERE s.project_id = p.id)
		)
		SELECT id FROM scope ORDER BY depth, id`,
	);
	return found.map((row) => row.id);
};
