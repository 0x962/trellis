import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { projectLaunchConfig } from "../projectLaunchConfig/projectLaunchConfig.ts";

export const launchConfig = async (tx: Tx, runId: string) => {
	const [root] = await rows<{ project_id: string }>(
		tx,
		sql`WITH RECURSIVE managers AS (
		SELECT id,project_id,0 AS depth FROM agent_runs WHERE id=${runId}
		UNION ALL SELECT r.id,r.project_id,m.depth+1 FROM managers m
		JOIN manager_delegations d ON d.run_id=m.id AND d.retired_at IS NULL JOIN agent_runs r ON r.id=d.parent_run_id
	) SELECT project_id FROM managers ORDER BY depth DESC LIMIT 1`,
	);
	return projectLaunchConfig(tx, { projectId: root!.project_id });
};
