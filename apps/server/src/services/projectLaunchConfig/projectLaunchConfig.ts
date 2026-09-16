import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { managerConfigOf } from "../projectRows.ts";

export async function projectLaunchConfig(tx: Tx, input: { projectId: string }) {
	const ancestors = await rows<{ manager_config: unknown }>(
		tx,
		sql`WITH RECURSIVE lineage AS (
			SELECT id,parent_id,manager_config,0 AS depth FROM projects WHERE id=${input.projectId}
			UNION ALL
			SELECT p.id,p.parent_id,p.manager_config,lineage.depth+1 FROM projects p JOIN lineage ON p.id=lineage.parent_id
		) SELECT manager_config FROM lineage ORDER BY depth`,
	);
	const configs = ancestors.map(managerConfigOf);
	const config = configs[0]!;
	return {
		...config,
		directory: configs.find((item) => item.directory !== "")?.directory ?? "",
		accountId: configs.find((item) => item.accountId !== null)?.accountId ?? null,
	};
}
