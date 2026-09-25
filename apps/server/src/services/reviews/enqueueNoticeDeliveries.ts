import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { Tx } from "../../db/tx.ts";
import type { CheckNoticeKind, NoticeCheck } from "../../gh/checkNotice.ts";
import { recipientsOf } from "./enqueueReviewDeliveries.ts";

// Writes one system notice and queues it for every ticket that links the
// pull request. One row of `review_deliveries` is one message that waits to
// be sent, and `dispatchDeliveries` sends it. A CI or queue notice can resume
// an agent after idle expiry. Other stopped agents keep their notices in `held`.
// A pull request that no ticket links gets no notice row:
// the person reads the checks on the page. A notice describes the pull
// request and no agent writes it, so it has no author and it reaches every
// ticket.
export const enqueueNoticeDeliveries = async (
	tx: Tx,
	input: {
		prId: string;
		headSha: string;
		kind: CheckNoticeKind;
		checks: NoticeCheck[];
		isQueued: boolean;
		queuePosition: number | null;
		at: Date;
	},
) => {
	const recipients = await recipientsOf(tx, { prId: input.prId, author: null });
	if (recipients.length === 0) return recipients;
	const noticeId = ulid();
	await tx.execute(
		sql`INSERT INTO check_notices
			(id, pr_id, head_sha, kind, checks, is_queued, queue_position, created_at)
		VALUES (${noticeId}, ${input.prId}, ${input.headSha}, ${input.kind}, ${JSON.stringify(input.checks)}::jsonb,
			${input.isQueued}, ${input.queuePosition}, ${input.at})`,
	);
	for (const recipient of recipients)
		await tx.execute(
			sql`INSERT INTO review_deliveries (id, check_notice_id, ticket_id)
			VALUES (${ulid()}, ${noticeId}, ${recipient.ticketId})`,
		);
	return recipients;
};
