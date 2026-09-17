import { type SQL, sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";

export const isManaged = (project: SQL) => sql`(${project}.manager_config->>'personaId' IS NOT NULL OR EXISTS (
	SELECT 1 FROM manager_delegations delegation WHERE delegation.project_id=${project}.id AND delegation.retired_at IS NULL))`;

export const managerScope = (projectId: string | SQL, includeArchived = false) => sql`WITH RECURSIVE scope AS (
	SELECT id FROM projects WHERE id=${projectId}
	UNION ALL SELECT p.id FROM projects p JOIN scope s ON p.parent_id=s.id
	WHERE NOT ${isManaged(sql`p`)} AND (${includeArchived} OR p.archived_at IS NULL)
) SELECT id FROM scope`;

export const ownerProject = async (tx: Tx, projectId: string) =>
	(
		await rows<{ id: string }>(
			tx,
			sql`WITH RECURSIVE ancestors AS (
		SELECT id,parent_id,manager_config,0 AS depth FROM projects WHERE id=${projectId}
		UNION ALL SELECT p.id,p.parent_id,p.manager_config,a.depth+1 FROM projects p JOIN ancestors a ON p.id=a.parent_id
	) SELECT p.id FROM ancestors p WHERE ${isManaged(sql`p`)} ORDER BY depth LIMIT 1`,
		)
	).at(0)?.id;
