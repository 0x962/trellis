import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { Tx } from "../../db/tx.ts";
import type { CheckNoticeKind, NoticeCheck } from "../../gh/checkNotice.ts";
import { recipientsOf } from "./enqueueReviewDeliveries.ts";

// Writes one check notice and queues it for every ticket that links the
// pull request. One row of `review_deliveries` is one message that waits to
// be sent, and `dispatchDeliveries` sends it. A ticket whose agent does not
// run keeps the message in the state `held`, and the next run of that
// ticket reads it. A pull request that no ticket links gets no notice row:
// the person reads the checks on the page. A notice describes the pull
// request and no agent writes it, so it has no author and it reaches every
// ticket.
export const enqueueCheckDeliveries = async (
	tx: Tx,
	input: { prId: string; headSha: string; kind: CheckNoticeKind; checks: NoticeCheck[]; at: Date },
) => {
	const recipients = await recipientsOf(tx, { prId: input.prId, author: null });
	if (recipients.length === 0) return recipients;
	const noticeId = ulid();
	await tx.execute(
		sql`INSERT INTO check_notices (id, pr_id, head_sha, kind, checks, created_at)
		VALUES (${noticeId}, ${input.prId}, ${input.headSha}, ${input.kind}, ${JSON.stringify(input.checks)}::jsonb, ${input.at})`,
	);
	for (const recipient of recipients)
		await tx.execute(
			sql`INSERT INTO review_deliveries (id, check_notice_id, ticket_id)
			VALUES (${ulid()}, ${noticeId}, ${recipient.ticketId})`,
		);
	return recipients;
};
