import { sql } from "drizzle-orm";
import { rows, textArray } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import type { CheckNoticeKind, NoticeCheck } from "../../../gh/checkNotice.ts";
import { isConflictKind } from "../../../gh/conflictNotice.ts";
import { type CommentNote, checkMessage, commentMessage, conflictMessage, reviewMessage } from "../deliveryMessage.ts";
import { commentBatchLimitSeconds, commentBatchSeconds } from "../enqueueCommentDeliveries.ts";
import { newestOpenRun, readyDelivery } from "../ticketRun.ts";

// prepareSend rejects input if terminalId or sessionId no longer matches the assigned agent.
type Delivery = {
	ids: string[];
	runId: string;
	terminalId: string;
	sessionId: string | null;
	text: string;
	prId?: string;
};
type Queued = Omit<Delivery, "text" | "ids"> & { id: string };
type ReviewRow = Queued & {
	url: string;
	drafts: number;
	verdict: "commented" | "changes_requested" | "approved";
	body: string;
};
type CommentRow = Queued & CommentNote & { url: string; prId: string };
type CheckRow = Queued & {
	url: string;
	baseRef: string;
	headSha: string;
	kind: CheckNoticeKind;
	checks: NoticeCheck[];
};

const assignedRun = newestOpenRun(
	sql`delivery.ticket_id`,
	sql`assignment.id, assignment.terminal_id, assignment.session_id, assignment.runtime`,
);
const deliveryColumns = sql`delivery.id, run.id AS "runId", run.terminal_id AS "terminalId",
	run.session_id AS "sessionId"`;
const readyRun = (terminals: string[]) =>
	sql`run.runtime = 'native' AND run.terminal_id = ANY(${textArray(terminals)})`;
const due = sql`delivery.due_at <= now()`;

const pendingReviews = async (tx: Tx, terminals: string[]): Promise<Delivery[]> => {
	const found = await rows<ReviewRow>(
		tx,
		sql`SELECT ${deliveryColumns}, pr.url AS "url",
			jsonb_array_length(submission.document -> 'threads') AS "drafts",
			submission.document ->> 'verdict' AS "verdict",
			submission.document ->> 'body' AS "body"
		FROM review_deliveries delivery
		${assignedRun}
		JOIN review_submissions submission ON submission.id = delivery.review_id
		JOIN pull_requests pr ON pr.id = submission.pr_id
		WHERE delivery.state = 'pending' AND delivery.review_id IS NOT NULL AND ${due}
			AND ${readyRun(terminals)}
		ORDER BY delivery.id LIMIT 20`,
	);
	return found.map((row) => ({ ...row, ids: [row.id], text: reviewMessage(row) }));
};

// A comment batch leaves when its newest comment is due or its oldest comment reaches the batch limit.
const quietTickets = sql`SELECT ticket_id FROM review_deliveries
	WHERE state = 'pending' AND thread_message_id IS NOT NULL
	GROUP BY ticket_id
	HAVING max(due_at) <= now()
		OR min(due_at) <= now() - make_interval(secs => ${commentBatchLimitSeconds - commentBatchSeconds})`;

const pendingComments = async (tx: Tx, terminals: string[], idleTerminals: string[]): Promise<Delivery[]> => {
	const found = await rows<CommentRow>(
		tx,
		sql`SELECT ${deliveryColumns}, pr.url AS "url", pr.id AS "prId",
			thread.document ->> 'path' AS "path",
			(thread.document ->> 'line')::int AS "line",
			CASE WHEN delivery.thread_message_id = thread.id THEN thread.document ->> 'body'
				ELSE (SELECT reply ->> 'body' FROM jsonb_array_elements(thread.document -> 'replies') reply
					WHERE reply ->> 'id' = delivery.thread_message_id) END AS "body"
		FROM review_deliveries delivery
		${assignedRun}
		JOIN review_threads thread ON thread.id = delivery.thread_id
		JOIN pull_requests pr ON pr.id = thread.pr_id
		WHERE delivery.state = 'pending' AND delivery.thread_message_id IS NOT NULL
			AND ${readyRun([...terminals, ...idleTerminals])} AND delivery.ticket_id IN (${quietTickets})
		ORDER BY delivery.id LIMIT 50`,
	);
	const batches = new Map<string, { row: CommentRow; comments: CommentNote[]; ids: string[] }>();
	for (const row of found) {
		const batch = batches.get(row.runId) ?? { row, comments: [], ids: [] };
		batch.comments.push({ path: row.path, line: row.line, body: row.body });
		batch.ids.push(row.id);
		batches.set(row.runId, batch);
	}
	return [...batches.values()].map(({ row, comments, ids }) => ({
		ids,
		prId: row.prId,
		runId: row.runId,
		terminalId: row.terminalId,
		sessionId: row.sessionId,
		text: commentMessage({ url: row.url, comments }),
	}));
};

const pendingChecks = async (tx: Tx, terminals: string[], idleTerminals: string[]): Promise<Delivery[]> => {
	const found = await rows<CheckRow>(
		tx,
		sql`SELECT ${deliveryColumns}, pr.url AS "url", pr.base_ref AS "baseRef", notice.head_sha AS "headSha",
			notice.kind, notice.checks
		FROM review_deliveries delivery
		${assignedRun}
		JOIN check_notices notice ON notice.id = delivery.check_notice_id
		JOIN pull_requests pr ON pr.id = notice.pr_id
		WHERE delivery.state = 'pending' AND ${due} AND ${readyDelivery(terminals, idleTerminals)}
		ORDER BY delivery.id LIMIT 20`,
	);
	return found.map((row) => ({
		...row,
		ids: [row.id],
		text: isConflictKind(row.kind) ? conflictMessage(row) : checkMessage(row),
	}));
};

export const pendingDeliveries = async (tx: Tx, terminals: string[], idleTerminals: string[]) => [
	...(await pendingReviews(tx, terminals)),
	...(await pendingComments(tx, terminals, idleTerminals)),
	...(await pendingChecks(tx, terminals, idleTerminals)),
];
