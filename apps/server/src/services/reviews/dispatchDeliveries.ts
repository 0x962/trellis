import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { type SQL, sql } from "drizzle-orm";
import { nativePreset } from "../../agents/native/harnessHost.ts";
import { rows } from "../../db/queries/support.ts";
import { CONFLICT_NOTICE_KINDS } from "../../db/tables/checkNotices.ts";
import type { Tx } from "../../db/tx.ts";
import type { CheckNoticeKind, NoticeCheck } from "../../gh/checkNotice.ts";
import { isConflictKind } from "../../gh/conflictNotice.ts";
import { prepareSend } from "../agentRuns/communication.ts";
import { sendDeadline } from "../deliveries/sendDeadline.ts";
import { supersededCheck, unconfirmedDelivery, waitingForRun } from "../deliveries/sentences.ts";
import type { IoCtx } from "../support.ts";
import { type CommentNote, checkMessage, commentMessage, conflictMessage, reviewMessage } from "./deliveryMessage.ts";
import { deliveryMessageId } from "./deliveryMessageId.ts";
import { report } from "./deliveryReport.ts";
import { commentBatchLimitSeconds, commentBatchSeconds } from "./enqueueCommentDeliveries.ts";
import { changed } from "./queries.ts";
import { newestOpenRun, readyAssignment } from "./ticketRun.ts";

// One queued message with the agent run that takes it now. Each row of
// `review_deliveries` names the ticket that must hear the message, and this
// step reads the open agent run of that ticket. `terminalId` and
// `sessionId` come from `agent_runs` at this moment, and the send refuses
// the message when either changes before the bytes leave. `text` is what
// the agent reads. `ids` names every `review_deliveries` row the message
// carries: one row for a verdict or a check notice, and one row per comment
// inside the batch window. `prId` holds the pull request of a comment
// batch, because the review page draws the state of each comment and needs
// the event that follows the send.
type Delivery = {
	ids: string[];
	runId: string;
	terminalId: string;
	sessionId: string | null;
	text: string;
	prId?: string;
};

// One pending row as the queries read it, before the rows of one agent
// become one message.
type Queued = Omit<Delivery, "text" | "ids"> & { id: string };

// The agent run that takes the messages of a ticket, with the columns the
// send needs.
const liveRun = newestOpenRun(
	sql`delivery.ticket_id`,
	sql`assignment.id, assignment.terminal_id, assignment.session_id`,
);

// The columns that every pending row shares.
const deliveryColumns = sql`delivery.id, run.id AS "runId", run.terminal_id AS "terminalId",
	run.session_id AS "sessionId"`;

const list = (values: string[]) =>
	sql.join(
		values.map((value) => sql`${value}`),
		sql`,`,
	);

// True while the run of a delivery has a process that runs and takes input.
const readyRun = (terminals: string[]) => sql`run.terminal_id IN (${list(terminals)})`;

// A verdict is due at the moment of its insert. Comments follow
// the rule of `quietTickets` below.
const due = sql`delivery.due_at <= now()`;

// A queued review submission. The stored document holds the pull request
// address and the comments the submission carried, so the message names both
// without a second query.
type ReviewRow = Queued & {
	url: string;
	drafts: number;
	verdict: "commented" | "changes_requested" | "approved";
	body: string;
};

const pendingReviews = async (tx: Tx, terminals: string[]): Promise<Delivery[]> => {
	const found = await rows<ReviewRow>(
		tx,
		sql`SELECT ${deliveryColumns},
			pr.url AS "url",
			jsonb_array_length(submission.document -> 'threads') AS "drafts",
			submission.document ->> 'verdict' AS "verdict",
			submission.document ->> 'body' AS "body"
		FROM review_deliveries delivery
		${liveRun}
		JOIN review_submissions submission ON submission.id = delivery.review_id
		JOIN pull_requests pr ON pr.id = submission.pr_id
		WHERE delivery.state = 'pending' AND delivery.review_id IS NOT NULL AND ${due}
			AND ${readyRun(terminals)}
		ORDER BY delivery.id LIMIT 20`,
	);
	return found.map((row) => ({ ...row, ids: [row.id], text: reviewMessage(row) }));
};

// A queued comment. The thread document holds the anchor and the text, so
// the message names the file, the line and the words without a second query.
// A reply carries the anchor of its thread.
type CommentRow = Queued & CommentNote & { url: string; prId: string };

// The tickets whose waiting comments may leave now: the newest comment is
// due, or the oldest has waited for the whole limit.
const quietTickets = sql`SELECT ticket_id FROM review_deliveries
	WHERE state = 'pending' AND thread_message_id IS NOT NULL
	GROUP BY ticket_id
	HAVING max(due_at) <= now()
		OR min(due_at) <= now() - make_interval(secs => ${commentBatchLimitSeconds - commentBatchSeconds})`;

// Every waiting comment of one agent becomes one message. The rows come back
// in the order the reviewers wrote them, and the group keeps that order.
const pendingComments = async (tx: Tx, terminals: string[]): Promise<Delivery[]> => {
	const found = await rows<CommentRow>(
		tx,
		sql`SELECT ${deliveryColumns}, pr.url AS "url", pr.id AS "prId",
			thread.document ->> 'path' AS "path",
			(thread.document ->> 'line')::int AS "line",
			CASE WHEN delivery.thread_message_id = thread.id THEN thread.document ->> 'body'
				ELSE (SELECT reply ->> 'body' FROM jsonb_array_elements(thread.document -> 'replies') reply
					WHERE reply ->> 'id' = delivery.thread_message_id) END AS "body"
		FROM review_deliveries delivery
		${liveRun}
		JOIN review_threads thread ON thread.id = delivery.thread_id
		JOIN pull_requests pr ON pr.id = thread.pr_id
		WHERE delivery.state = 'pending' AND delivery.thread_message_id IS NOT NULL
			AND ${readyRun(terminals)} AND delivery.ticket_id IN (${quietTickets})
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

// A check notice leaves only while it still describes the pull request. A
// notice that a newer notice of the same family, a new head commit, or a
// merge replaced fails, so the agent never reads an old result. The merge
// family holds `conflict` and `clear`, and a check result never replaces a
// merge result.
const mergeFamily = (notice: SQL) => sql`(${notice}.kind IN (${list([...CONFLICT_NOTICE_KINDS])}))`;

const dropStaleCheckDeliveries = (tx: Tx) =>
	rows<{ id: string }>(
		tx,
		sql`UPDATE review_deliveries delivery SET state = 'failed', error = ${supersededCheck}
		FROM check_notices notice, pull_requests pr
		WHERE delivery.check_notice_id = notice.id AND pr.id = notice.pr_id
			AND delivery.state IN ('pending', 'held')
			AND (pr.state <> 'open' OR pr.head_sha IS DISTINCT FROM notice.head_sha
				OR EXISTS (SELECT 1 FROM check_notices newer WHERE newer.pr_id = notice.pr_id
					AND ${mergeFamily(sql`newer`)} = ${mergeFamily(sql`notice`)}
					AND (newer.created_at, newer.id) > (notice.created_at, notice.id)))
		RETURNING delivery.id`,
	);

// A message whose ticket has no agent process that runs waits in the state
// `held`. The next run of that ticket takes it.
const holdDeliveries = (tx: Tx, terminals: string[]) =>
	rows<{ id: string }>(
		tx,
		sql`UPDATE review_deliveries delivery SET state = 'held', error = ${waitingForRun}
		WHERE delivery.state = 'pending' AND ${due} AND NOT ${readyAssignment(sql`delivery.ticket_id`, terminals)}
		RETURNING delivery.id`,
	);

// A held message whose ticket runs an agent again joins the queue.
const releaseDeliveries = (tx: Tx, terminals: string[]) =>
	rows<{ id: string }>(
		tx,
		sql`UPDATE review_deliveries delivery SET state = 'pending', error = NULL
		WHERE delivery.state = 'held' AND ${readyAssignment(sql`delivery.ticket_id`, terminals)}
		RETURNING delivery.id`,
	);

// A queued check notice. The notice row holds the commit and the checks, so
// the message names both without a second query.
type CheckRow = Queued & {
	url: string;
	baseRef: string;
	headSha: string;
	kind: CheckNoticeKind;
	checks: NoticeCheck[];
};

const pendingChecks = async (tx: Tx, terminals: string[]): Promise<Delivery[]> => {
	const found = await rows<CheckRow>(
		tx,
		sql`SELECT ${deliveryColumns}, pr.url AS "url", pr.base_ref AS "baseRef", notice.head_sha AS "headSha",
			notice.kind, notice.checks
		FROM review_deliveries delivery
		${liveRun}
		JOIN check_notices notice ON notice.id = delivery.check_notice_id
		JOIN pull_requests pr ON pr.id = notice.pr_id
		WHERE delivery.state = 'pending' AND ${due} AND ${readyRun(terminals)}
		ORDER BY delivery.id LIMIT 20`,
	);
	return found.map((row) => ({
		...row,
		ids: [row.id],
		text: isConflictKind(row.kind) ? conflictMessage(row) : checkMessage(row),
	}));
};

// What one failed attempt writes on the row. `sendDeadline` rejects with the
// sentence `unconfirmedDelivery` when the send passes its 15 second limit,
// and only then can the agent hold the message already. Every other error
// means that no byte left this server, so the row says failed and keeps the
// text of the error, which is the one place a person reads the cause.
const outcomeOf = (failure: unknown) => {
	const text = failure instanceof Error ? failure.message : String(failure);
	return text === unconfirmedDelivery ? { state: "unknown", error: text } : { state: "failed", error: text };
};

// Sends every queued message whose agent process runs and accepts input.
// `sessions` is the list the execution service reports for this machine.
export const dispatchDeliveries = async (
	ctx: IoCtx,
	sessions: RuntimeProcessStatus[],
	send = prepareSend,
	preset = nativePreset,
) => {
	const ready = sessions
		.filter((session) => session.status === "running" && session.controllable)
		.map((session) => session.id);
	const moved = await ctx.newTx(async (tx) => {
		const dropped = await report(
			ctx,
			tx,
			"delivery dropped",
			(await dropStaleCheckDeliveries(tx)).map((row) => row.id),
			{ reason: supersededCheck },
		);
		const released = await report(
			ctx,
			tx,
			"delivery released",
			(await releaseDeliveries(tx, ready)).map((row) => row.id),
		);
		const held = await report(
			ctx,
			tx,
			"delivery held",
			(await holdDeliveries(tx, ready)).map((row) => row.id),
		);
		return [...dropped, ...released, ...held];
	});
	// The review page draws the state of each message, so every page that
	// shows one of these pull requests reads the new word.
	for (const prId of new Set(moved.map((row) => row.prId))) await ctx.newTx((tx) => changed(ctx, tx, prId));
	if (ready.length === 0) return;
	const pending = await ctx.newTx(async (tx) => [
		...(await pendingReviews(tx, ready)),
		...(await pendingComments(tx, ready)),
		...(await pendingChecks(tx, ready)),
	]);
	for (const delivery of pending) {
		const claimed = await ctx.newTx((tx) =>
			rows<{ id: string }>(
				tx,
				sql`UPDATE review_deliveries SET state = 'sending', run_id = ${delivery.runId}
				WHERE id IN (${list(delivery.ids)}) AND state = 'pending' RETURNING id`,
			),
		);
		if (claimed.length === 0) continue;
		let outcome: { state: string; error: string | null } = { state: "sent", error: null };
		try {
			const interrupt = (await preset(ctx.home, delivery.terminalId)) !== "custom";
			await sendDeadline(
				send(ctx, {
					id: delivery.runId,
					interrupt,
					text: delivery.text,
					messageId: deliveryMessageId(delivery.ids[0]!),
					expectedTerminalId: delivery.terminalId,
					expectedSessionId: delivery.sessionId,
				}),
			);
		} catch (failure) {
			outcome = outcomeOf(failure);
		}
		const ids = claimed.map((row) => row.id);
		await ctx.newTx(async (tx) => {
			await tx.execute(
				sql`UPDATE review_deliveries SET state = ${outcome.state}, error = ${outcome.error}
				WHERE id IN (${list(ids)})`,
			);
			await report(ctx, tx, `delivery ${outcome.state}`, ids, { run: delivery.runId, error: outcome.error });
		});
		// The review page draws the state of each comment, so the page that
		// waits for this send learns the new word.
		if (delivery.prId) await ctx.newTx((tx) => changed(ctx, tx, delivery.prId!));
	}
};
