import { type PrState, type ReviewPrSchema, type ReviewReadyFacts, reviewGaps } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import type { z } from "zod";
import { flowAppliesToProject } from "../../db/queries/flowScope.ts";
import { localHumanVerdict } from "../../db/queries/pullRequestRows.ts";
import { hasEvidenceSql, hasExplanationSql, reviewReadyFacts } from "../../db/queries/reviewReady.ts";
import { iso, rows } from "../../db/queries/support";
import type { Tx } from "../../db/tx";
import { resolveProject } from "../refs";
import type { IoCtx, ServiceCtx } from "../support";
import { changed, ensurePr } from "./queries";

export async function open(ctx: ServiceCtx, tx: Tx, input: { pr: string }) {
	const pr = await ensurePr(tx, input.pr);
	await changed(ctx, tx, pr.id);
	return pr;
}

// All stored pull requests of one project: the ones linked to a ticket of
// the project, and the ones in a repository of the project.
const projectClause = async (ctx: IoCtx, tx: Tx, ref: string): Promise<SQL> => {
	const project = await resolveProject(ctx.core, tx, ref);
	return sql`(EXISTS (SELECT 1 FROM ticket_pull_requests l JOIN tickets t ON t.id = l.ticket_id
			WHERE l.pull_request_id = p.id AND t.project_id = ${project.id})
		OR EXISTS (SELECT 1 FROM repos r
			WHERE r.project_id = ${project.id} AND r.owner = p.owner AND r.repo = p.repo))`;
};

// A project includes linked pull requests and every stored pull request in its configured repositories.
export async function prs(ctx: IoCtx, tx: Tx, input: { project?: string; all?: boolean }) {
	const where =
		input.project === undefined
			? input.all
				? sql`true`
				: sql`p.review_retained`
			: await projectClause(ctx, tx, input.project);
	// The joins to applicable_flows must precede status reads because execution documents can be large.
	const found = await rows<z.infer<typeof ReviewPrSchema> & ReviewPrFacts>(
		tx,
		sql`WITH selected_prs AS MATERIALIZED (
			SELECT p.id, p.url, p.owner, p.repo, p.number, p.title, p.state, p.mergeable,
				p.is_draft, p.is_queued, p.local_state, p.checks, p.ci_state, p.head_sha, p.created_at, p.updated_at
			FROM pull_requests p WHERE ${where}
		), thread_totals AS (
			SELECT t.pr_id,
				count(*) FILTER (WHERE t.document->>'status' = 'open')::int AS open,
				count(*) FILTER (WHERE t.document->>'status' = 'resolved')::int AS resolved,
				max(t.updated_at) AS updated_at
			FROM review_threads t JOIN selected_prs p ON p.id = t.pr_id
			GROUP BY t.pr_id
		), linked_projects AS (
			SELECT DISTINCT link.pull_request_id AS pr_id, ticket.project_id
			FROM ticket_pull_requests link
			JOIN selected_prs p ON p.id = link.pull_request_id
			JOIN tickets ticket ON ticket.id = link.ticket_id
		), applicable_flows AS MATERIALIZED (
			SELECT DISTINCT linked.pr_id, flow.id AS flow_id
			FROM linked_projects linked
			JOIN flows flow ON ${flowAppliesToProject(sql`flow`, sql`linked.project_id`)}
		), selected_executions AS (
			SELECT execution.diff_id, execution.flow_id, execution.state->>'status' AS status
			FROM flow_executions execution
			JOIN applicable_flows flow ON flow.pr_id = execution.diff_id AND flow.flow_id = execution.flow_id
			UNION ALL
			SELECT execution.diff_id, execution.flow_id, projection.view->>'status' AS status
			FROM langflow_executions execution
			JOIN applicable_flows flow ON flow.pr_id = execution.diff_id AND flow.flow_id = execution.flow_id
			JOIN langflow_execution_projections projection ON projection.execution_id = execution.execution_id
		), flow_totals AS (
			SELECT flow.pr_id, bool_or(execution.status = 'succeeded') AS succeeded
			FROM applicable_flows flow
			LEFT JOIN selected_executions execution ON execution.diff_id = flow.pr_id AND execution.flow_id = flow.flow_id
			GROUP BY flow.pr_id
		)
		SELECT p.id, p.url, p.owner, p.repo, p.number, p.title, p.state, p.mergeable,
		p.is_draft AS "isDraft", p.is_queued AS "isQueued", p.local_state AS "localState", p.checks, p.ci_state AS "ciState",
		${localHumanVerdict(sql`p.id`)} AS "localVerdict",
		${hasExplanationSql(sql`p`)} AS "hasExplanation",
		${hasEvidenceSql(sql`p`)} AS "hasEvidence",
		(flow_totals.pr_id IS NULL OR COALESCE(flow_totals.succeeded, false)
			OR EXISTS (SELECT 1 FROM pr_flow_waivers waiver WHERE waiver.pull_request_id = p.id)) AS "flowAnswered",
		COALESCE(thread_totals.open, 0) AS open, COALESCE(thread_totals.resolved, 0) AS resolved,
		${iso(sql`COALESCE(thread_totals.updated_at, p.updated_at)`)} AS "updatedAt"
		FROM selected_prs p
		LEFT JOIN thread_totals ON thread_totals.pr_id = p.id
		LEFT JOIN flow_totals ON flow_totals.pr_id = p.id
		ORDER BY p.created_at DESC, p.id DESC`,
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
