import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import type { IoCtx } from "../support.ts";

// What one log line says about one message. `kind` is the kind of the check
// notice, or the word `review` or `comment` for the two message kinds that
// a person writes. `headSha` is the commit a check notice describes, and it
// is null for the other two kinds.
export type DeliveryFacts = {
	id: string;
	prId: string;
	url: string;
	kind: string;
	headSha: string | null;
	ticket: string;
};

// The pull request, the kind and the ticket of each message. A message
// points at a check notice, a review submission or a review thread, and
// each of the three names the pull request.
const factsOf = (tx: Tx, ids: string[]) =>
	rows<DeliveryFacts>(
		tx,
		sql`SELECT delivery.id,
			coalesce(notice_pr.id, review_pr.id, thread_pr.id) AS "prId",
			coalesce(notice_pr.url, review_pr.url, thread_pr.url) AS "url",
			coalesce(notice.kind, CASE WHEN delivery.review_id IS NULL THEN 'comment' ELSE 'review' END) AS kind,
			notice.head_sha AS "headSha",
			root.key || '-' || ticket.number AS ticket
		FROM review_deliveries delivery
		JOIN tickets ticket ON ticket.id = delivery.ticket_id
		JOIN projects root ON root.id = ticket.root_id
		LEFT JOIN check_notices notice ON notice.id = delivery.check_notice_id
		LEFT JOIN pull_requests notice_pr ON notice_pr.id = notice.pr_id
		LEFT JOIN review_submissions submission ON submission.id = delivery.review_id
		LEFT JOIN pull_requests review_pr ON review_pr.id = submission.pr_id
		LEFT JOIN review_threads thread ON thread.id = delivery.thread_id
		LEFT JOIN pull_requests thread_pr ON thread_pr.id = thread.pr_id
		WHERE delivery.id IN (${sql.join(
			ids.map((id) => sql`${id}`),
			sql`,`,
		)})
		ORDER BY delivery.id`,
	);

// Writes one log line per message that changed its way, so a person who
// asks why an agent heard nothing about a pull request reads the answer
// from the log. The returned rows name the pull request of each message.
export const report = async (
	ctx: IoCtx,
	tx: Tx,
	message: string,
	ids: string[],
	fields: Record<string, unknown> = {},
): Promise<DeliveryFacts[]> => {
	if (ids.length === 0) return [];
	const facts = await factsOf(tx, ids);
	for (const row of facts)
		ctx.log(message, { pr: row.url, kind: row.kind, head: row.headSha, ticket: row.ticket, ...fields });
	return facts;
};
