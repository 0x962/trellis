import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { projectLaunchConfig } from "./projectLaunchConfig.ts";

export async function assertBuilderDefaults(tx: Tx, input: { projectId: string }) {
	const projects = await rows<{ id: string }>(
		tx,
		sql`WITH RECURSIVE descendants AS (
		SELECT id FROM projects WHERE id=${input.projectId}
		UNION ALL SELECT p.id FROM projects p JOIN descendants d ON p.parent_id=d.id
	) SELECT DISTINCT t.project_id AS id FROM tickets t JOIN statuses s ON s.id=t.status_id
	WHERE s.category='started' AND t.project_id IN (SELECT id FROM descendants)`,
	);
	for (const project of projects) {
		const config = await projectLaunchConfig(tx, { projectId: project.id });
		if (!config.builder?.personaId)
			throw invalidInput(
				"managerConfig.builder",
				"Select a default builder while this project or its children have tickets in In Progress.",
			);
	}
}
