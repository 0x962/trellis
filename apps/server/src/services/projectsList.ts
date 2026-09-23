import { type ProjectListInput, ProjectListInputSchema, type ProjectSummary } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../context.ts";
import {
	type ProjectSummaryRow,
	projectSummaryColumns,
	projectSummaryJoins,
	toProjectSummary,
} from "../db/queries/projectSummary.ts";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";

// Every project in display order. `archived` keeps only archived or only
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
		sql`SELECT ${projectSummaryColumns} ${projectSummaryJoins} WHERE ${where} ORDER BY p.position, p.slug`,
	);
	return found.map(toProjectSummary);
};
