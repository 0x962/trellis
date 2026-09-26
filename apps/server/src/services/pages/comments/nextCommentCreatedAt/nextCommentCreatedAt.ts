import { sql } from "drizzle-orm";
import { rows } from "../../../../db/queries/support.ts";
import type { Tx } from "../../../../db/tx.ts";

// Callers hold the Page row lock. Each new comment sorts after the earlier
// comments of that Page, even when its request waits behind another request.
export async function nextCommentCreatedAt(tx: Tx, pageId: string, now: Date) {
	const [row] = await rows<{ at: string }>(
		tx,
		sql`SELECT GREATEST(${now}::timestamptz,
		MAX(c.created_at) + interval '1 millisecond')::text AS at
		FROM page_comments c JOIN page_comment_threads thread ON thread.id = c.thread_id
		WHERE thread.page_id = ${pageId}`,
	);
	return row!.at;
}
