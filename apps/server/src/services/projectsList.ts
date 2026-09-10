import { type ProjectListInput, ProjectListInputSchema, type ProjectSummary } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../context.ts";
import {
	type ProjectSummaryRow,
	projectCtes,
	projectSummaryColumns,
	projectSummaryJoins,
	toProjectSummary,
} from "../db/queries/projectSummary.ts";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";

// The position of every ancestor, root first, so a sort on it lists a
// parent before its children and siblings in position order.
const orderCte = sql`ordered AS (
	SELECT id, ARRAY[position] AS sort, 0 AS depth FROM projects WHERE parent_id IS NULL
	UNION ALL
	SELECT p.id, ordered.sort || p.position, ordered.depth + 1
	FROM projects p JOIN ordered ON p.parent_id = ordered.id
	WHERE ordered.depth < 64
)`;

// The whole tree as a flat list. `archived` keeps only archived or only
// active projects; without it every project is listed.
export const list = async (_ctx: ServiceCtx, tx: Tx, rawInput: ProjectListInput): Promise<ProjectSummary[]> => {
	const input = ProjectListInputSchema.parse(rawInput ?? {});
	const where =
		input.archived === undefined
			? sql`true`
			: input.archived
				? sql`p.archived_at IS NOT NULL`
				: sql`p.archived_at IS NULL`;
	const found = await rows<ProjectSummaryRow>(
		tx,
		sql`WITH RECURSIVE ${projectCtes}, ${orderCte}
			SELECT ${projectSummaryColumns} ${projectSummaryJoins}
			JOIN ordered o ON o.id = p.id
			WHERE ${where}
			ORDER BY o.sort, p.slug`,
	);
	return found.map(toProjectSummary);
};
