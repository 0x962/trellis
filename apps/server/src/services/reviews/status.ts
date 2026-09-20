import type { TicketPr } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support";
import { requestedTicketPrJoin } from "../../db/queries/ticketPrs.ts";
import type { Tx } from "../../db/tx";
import type { PrepareCtx, ServiceCtx } from "../support";
import { parseRef } from "./queries.ts";
import { status as remoteStatus } from "./revision.ts";

export type PreparedStatus = { pr: string; remote: Record<string, unknown> };

export async function prepare(ctx: PrepareCtx, input: { pr: string }): Promise<PreparedStatus> {
	return { pr: input.pr, remote: await remoteStatus(ctx, input) };
}

export async function status(_ctx: ServiceCtx, tx: Tx, input: PreparedStatus) {
	const ref = parseRef(input.pr);
	const [row] = await rows<{
		identifier: string;
		title: string;
		ticket_pr_rows: TicketPr[];
	}>(
		tx,
		sql`
			SELECT root.key || '-' || t.number AS identifier, t.title,
				ticket_pr.pull_requests AS ticket_pr_rows
			FROM (
				SELECT t.*, requested_pr.id AS requested_pr_id
				FROM ticket_pull_requests requested_link
				JOIN pull_requests requested_pr ON requested_pr.id = requested_link.pull_request_id
				JOIN tickets t ON t.id = requested_link.ticket_id
				JOIN projects root ON root.id = t.root_id
				WHERE requested_pr.owner = ${ref.owner}
					AND requested_pr.repo = ${ref.repo}
					AND requested_pr.number = ${ref.number}
				ORDER BY root.key, t.number, t.id
				LIMIT 1
			) t
			JOIN projects root ON root.id = t.root_id
			${requestedTicketPrJoin}
		`,
	);
	if (!row) return { ...input.remote, ticket: null, prRow: null };
	return {
		...input.remote,
		ticket: { identifier: row.identifier, title: row.title },
		prRow: row.ticket_pr_rows[0]!,
	};
}
