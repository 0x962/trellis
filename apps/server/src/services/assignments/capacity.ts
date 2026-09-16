import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { managerConfigOf, projectRow } from "../projectRows.ts";

export const capacityAvailable = async (tx: Tx, input: { projectId: string }) => {
	const config = managerConfigOf(await projectRow(tx, input.projectId));
	const [active] = await rows<{ count: number }>(
		tx,
		sql`SELECT count(*)::int AS count FROM agent_runs
 WHERE project_id=${input.projectId} AND kind <> 'manager' AND runtime='native' AND closed_at IS NULL`,
	);
	return active!.count < config.concurrency;
};
