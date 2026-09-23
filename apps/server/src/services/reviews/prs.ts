import { type PrState, type ReviewPrSchema, type ReviewReadyFacts, reviewGaps } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import type { z } from "zod";
import { flowAnsweredSql, hasEvidenceSql, hasExplanationSql, reviewReadyFacts } from "../../db/queries/reviewReady.ts";
import { iso, rows, textArray } from "../../db/queries/support";
import type { Tx } from "../../db/tx";
import { chainOf, resolveProject } from "../refs";
import type { IoCtx, ServiceCtx } from "../support";
import { changed, ensurePr } from "./queries";

export async function open(ctx: ServiceCtx, tx: Tx, input: { pr: string }) {
	const pr = await ensurePr(tx, input.pr);
	await changed(ctx, tx, pr.id);
	return pr;
}

// The pull requests of one project: the ones linked to a ticket of the
// project or one of its sub-projects, and the ones in a repository of the
// project or one of its ancestors. A sub-project inherits the repositories
// of its ancestors, the way `effectiveRepos` reads them.
const projectClause = async (ctx: IoCtx, tx: Tx, ref: string): Promise<SQL> => {
	const project = await resolveProject(ctx.core, tx, ref);
	const subtree = ctx.core.cache.resolveSubtree(project.id);
	const chain = chainOf(ctx.core.cache, project.id).map((ancestor) => ancestor.id);
	return sql`(EXISTS (SELECT 1 FROM ticket_pull_requests l JOIN tickets t ON t.id = l.ticket_id
			WHERE l.pull_request_id = p.id AND t.project_id = ANY(${textArray(subtree)}))
		OR EXISTS (SELECT 1 FROM repos r
			WHERE r.project_id = ANY(${textArray(chain)}) AND r.owner = p.owner AND r.repo = p.repo))`;
};

// Without a project: every pull request kept for a local review. With a
// project: every pull request of that project, retained or not.
export async function prs(ctx: IoCtx, tx: Tx, input: { project?: string }) {
	const where = input.project === undefined ? sql`p.review_retained` : await projectClause(ctx, tx, input.project);
	const found = await rows<z.infer<typeof ReviewPrSchema> & ReviewPrFacts>(
		tx,
		sql`SELECT p.id, p.url, p.owner, p.repo, p.number, p.title, p.state, p.mergeable,
		p.is_draft AS "isDraft", p.is_queued AS "isQueued", p.local_state AS "localState", p.checks, p.ci_state AS "ciState",
		${hasExplanationSql(sql`p`)} AS "hasExplanation",
		${hasEvidenceSql(sql`p`)} AS "hasEvidence",
		${flowAnsweredSql(sql`p`)} AS "flowAnswered",
		(SELECT count(*)::int FROM review_threads t WHERE t.pr_id = p.id AND t.document->>'status' = 'open') AS open,
		(SELECT count(*)::int FROM review_threads t WHERE t.pr_id = p.id AND t.document->>'status' = 'resolved') AS resolved,
		${iso(sql`COALESCE((SELECT max(t.updated_at) FROM review_threads t WHERE t.pr_id = p.id), p.updated_at)`)} AS "updatedAt"
		FROM pull_requests p WHERE ${where} ORDER BY "updatedAt" DESC`,
	);
	return found.map(({ hasExplanation, hasEvidence, flowAnswered, mergeable, ...row }) => ({
		...row,
		reviewGaps: reviewGaps(
			reviewReadyFacts({
				state: row.state as PrState,
				localState: row.localState,
				checks: row.checks,
				openFindings: row.open,
				hasExplanation,
				hasEvidence,
				flowAnswered,
				mergeable,
			}),
		),
	}));
}

// The facts that `reviewGaps` reads and that no field of `ReviewPrSchema`
// carries. `open` is the count of open review threads, which is the count of
// findings the rule reads.
type ReviewPrFacts = Pick<ReviewReadyFacts, "hasExplanation" | "hasEvidence" | "flowAnswered" | "mergeable">;
