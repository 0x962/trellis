import type { ReviewOverview } from "@trellis/api";
import { sql } from "drizzle-orm";
import { toPullRequest } from "../../../db/queries/pullRequestRows.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { read as readEvidence } from "../../evidence/evidence.ts";
import { findPullRequestRow } from "../../findPullRequestRow.ts";
import { read as readSummary } from "../../prSummary.ts";
import type { ServiceCtx } from "../../support.ts";
import { findPr } from "../queries.ts";

export async function overview(ctx: ServiceCtx, tx: Tx, input: { pr: string }): Promise<ReviewOverview | null> {
	const stored = await findPr(tx, input.pr);
	if (stored === undefined) return null;
	const { files: _files, ...pullRequest } = toPullRequest(await findPullRequestRow(tx, stored.id));
	const [ticket] = await rows<NonNullable<ReviewOverview["ticket"]>>(
		tx,
		sql`SELECT p.key || '-' || t.number AS identifier, t.title
			FROM ticket_pull_requests link
			JOIN tickets t ON t.id = link.ticket_id
			JOIN projects p ON p.id = t.project_id
			WHERE link.pull_request_id = ${stored.id}
			ORDER BY p.key, t.number, t.id LIMIT 1`,
	);
	const summary = await readSummary(ctx, tx, { id: stored.id });
	const evidence = await readEvidence(ctx, tx, { id: stored.id });
	return { pullRequest, ticket: ticket ?? null, summary, evidence };
}
