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
	const found = await rows<{ directory: string }>(
		tx,
		sql`SELECT directory FROM projects WHERE id = ${input.projectId}`,
	);
	return { directory: found[0]?.directory ?? "", harness: input.harness, accountId: null };
}
