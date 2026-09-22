import { sql } from "drizzle-orm";

// The pull request of one `review_deliveries` row. A row points at a check
// notice, at a review submission, or at a review thread, and each of the
// three names the pull request it belongs to. Every caller reads the pull
// request of a message through this expression, so one rule answers it.
export const prOfDelivery = sql`coalesce(
	(SELECT notice.pr_id FROM check_notices notice WHERE notice.id = delivery.check_notice_id),
	(SELECT submission.pr_id FROM review_submissions submission WHERE submission.id = delivery.review_id),
	(SELECT thread.pr_id FROM review_threads thread WHERE thread.id = delivery.thread_id)
)`;
