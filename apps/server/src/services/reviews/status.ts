import type { Check } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support";
import { requestedTicketPrJoin, type TicketPrRow, toTicketPrRows } from "../../db/queries/ticketPrs.ts";
import type { Tx } from "../../db/tx";
import type { PrepareCtx, ServiceCtx } from "../support";
import { parseRef } from "./queries.ts";
import { status as remoteStatus } from "./revision.ts";

export type PreparedStatus = { pr: string; remote: Record<string, unknown> & { headRefOid: string } };

export async function prepare(ctx: PrepareCtx, input: { pr: string }): Promise<PreparedStatus> {
	return { pr: input.pr, remote: await remoteStatus(ctx, input) };
}

export async function status(_ctx: ServiceCtx, tx: Tx, input: PreparedStatus) {
	const ref = parseRef(input.pr);
	const [pullRequest] = await rows<{ checks: Check[]; fetched_at: string | null; is_queued: boolean }>(
		tx,
		sql`SELECT checks, fetched_at, is_queued FROM pull_requests
			WHERE owner = ${ref.owner} AND repo = ${ref.repo} AND number = ${ref.number}`,
	);
	const checks = pullRequest?.fetched_at == null ? null : pullRequest.checks;
	const isQueued = pullRequest?.is_queued ?? false;
	const [row] = await rows<{
		identifier: string;
		title: string;
		ticket_pr_rows: TicketPrRow[];
	}>(
		tx,
		sql`
			SELECT proj.key || '-' || t.number AS identifier, t.title,
				ticket_pr.pull_requests AS ticket_pr_rows
			FROM (
				SELECT t.*, requested_pr.id AS requested_pr_id
				FROM ticket_pull_requests requested_link
				JOIN pull_requests requested_pr ON requested_pr.id = requested_link.pull_request_id
				JOIN tickets t ON t.id = requested_link.ticket_id
				JOIN projects proj ON proj.id = t.project_id
				WHERE requested_pr.owner = ${ref.owner}
					AND requested_pr.repo = ${ref.repo}
					AND requested_pr.number = ${ref.number}
				ORDER BY proj.key, t.number, t.id
				LIMIT 1
			) t
			JOIN projects proj ON proj.id = t.project_id
			${requestedTicketPrJoin}
		`,
	);
	if (!row) return { ...input.remote, isQueued, ticket: null, prRow: null, checks };
	return {
		...input.remote,
		isQueued,
		ticket: { identifier: row.identifier, title: row.title },
		prRow: toTicketPrRows(row.ticket_pr_rows)[0]!,
		checks,
	};
}
