import type { Harness } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";

export type ProjectLaunchConfig = {
	directory: string;
	harness: Harness;
	accountId: null;
};

export async function projectLaunchConfig(
	tx: Tx,
	input: { projectId: string; harness: Harness },
): Promise<ProjectLaunchConfig> {
	const ancestors = await rows<{ directory: string }>(
		tx,
		sql`WITH RECURSIVE lineage AS (
			SELECT id,parent_id,directory,0 AS depth FROM projects WHERE id=${input.projectId}
			UNION ALL
			SELECT p.id,p.parent_id,p.directory,lineage.depth+1 FROM projects p JOIN lineage ON p.id=lineage.parent_id
		) SELECT directory FROM lineage ORDER BY depth`,
	);
	return {
		directory: ancestors.find((item) => item.directory !== "")?.directory ?? "",
		harness: input.harness,
		accountId: null,
	};
}
