import type { AgentRunPullRequestsInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../context.ts";
import { type PullRequestRow, pullRequestColumns, toPullRequest } from "../../../db/queries/pullRequestRows.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { resolveProject } from "../../refs.ts";

export const pullRequests = async (ctx: ServiceCtx, tx: Tx, input: AgentRunPullRequestsInput) => {
	const project = input.project === undefined ? null : await resolveProject(ctx, tx, input.project);
	if (input.ids.length === 0) return [];
	const found = await rows<PullRequestRow & { run_id: string }>(
		tx,
		sql`SELECT ${pullRequestColumns}, source.run_id FROM pull_requests p
		JOIN (
			SELECT DISTINCT link.pull_request_id, run.id AS run_id
			FROM ticket_pull_requests link
			JOIN agent_runs run ON link.actor_kind='agent' AND link.actor_name=run.id
			WHERE run.id IN (${sql.join(
				input.ids.map((id) => sql`${id}`),
				sql`, `,
			)})
				AND ${project === null ? sql`true` : sql`run.project_id=${project.id}`}
		) source ON source.pull_request_id=p.id
		ORDER BY source.run_id, p.created_at, p.id`,
	);
	return found.map((row) => ({ runId: row.run_id, pullRequest: toPullRequest(row) }));
};
