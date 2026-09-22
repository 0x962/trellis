import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { Tx } from "../../db/tx.ts";
import type { CheckNoticeKind, NoticeCheck } from "../../gh/checkNotice.ts";
import { agentsOf } from "./enqueueReviewDeliveries.ts";

// Writes one check notice and queues it for every agent that holds a ticket
// of the pull request. One row of `review_deliveries` is one message that
// waits to be sent, and `dispatchDeliveries` sends it. A pull request that
// no agent holds gets no notice row either: the person reads the checks on
// the page, and a later agent hears about the next change.
export const enqueueCheckDeliveries = async (
	tx: Tx,
	input: { prId: string; headSha: string; kind: CheckNoticeKind; checks: NoticeCheck[]; at: Date },
) => {
	const deliveries = await agentsOf(tx, input.prId);
	if (deliveries.length === 0) return deliveries;
	const noticeId = ulid();
	await tx.execute(
		sql`INSERT INTO check_notices (id, pr_id, head_sha, kind, checks, created_at)
		VALUES (${noticeId}, ${input.prId}, ${input.headSha}, ${input.kind}, ${JSON.stringify(input.checks)}::jsonb, ${input.at})`,
	);
	for (const delivery of deliveries)
		await tx.execute(
			sql`INSERT INTO review_deliveries (id, check_notice_id, run_id)
			VALUES (${ulid()}, ${noticeId}, ${delivery.runId})`,
		);
	return deliveries;
};
