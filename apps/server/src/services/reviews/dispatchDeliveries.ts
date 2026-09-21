import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { nativePreset } from "../../agents/native/harnessHost.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { prepareSend } from "../agentRuns/communication.ts";
import { sendDeadline } from "../deliveries/sendDeadline.ts";
import { closedBeforeDelivery, unconfirmedDelivery } from "../deliveries/sentences.ts";
import type { IoCtx } from "../support.ts";
import { answerMessage, type CommentNote, commentMessage, reviewMessage } from "./deliveryMessage.ts";
import { deliveryMessageId } from "./deliveryMessageId.ts";
import { changed } from "./queries.ts";

// One queued message with the agent run that waits for it. `terminalId` and
// `sessionId` come from `agent_runs` at this moment, and the send refuses the
// message when either changes before the bytes leave. `text` is what the
// agent reads. `ids` names every `review_deliveries` row the message
// carries: one row for a verdict or an answer, and one row per comment for
// the comments a person wrote inside the batch window. `prId` holds the
// pull request of a comment batch, because the review page draws the state
// of each comment and needs the event that follows the send.
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

// The columns that every pending row shares.
const deliveryColumns = sql`delivery.id, delivery.run_id AS "runId", run.terminal_id AS "terminalId",
	run.session_id AS "sessionId"`;

const list = (values: string[]) =>
	sql.join(
		values.map((value) => sql`${value}`),
		sql`,`,
	);

const runningTerminals = (terminals: string[]) => sql`run.terminal_id IN (${list(terminals)})`;

// A row waits until its own moment. `due_at` sits a few seconds ahead for a
// comment, and at the moment of the insert for a verdict or an answer.
const due = sql`delivery.due_at <= now()`;

const failDeliveriesOfClosedRuns = (tx: Tx) =>
	tx.execute(
		sql`UPDATE review_deliveries delivery SET state = 'failed', error = ${closedBeforeDelivery}
		FROM agent_runs run
		WHERE delivery.run_id = run.id AND delivery.state = 'pending' AND run.closed_at IS NOT NULL`,
	);

// A queued answer of a question ticket. `question` is the ticket that holds
// the answer, and `waiting` is the ticket the run works on. `description` is
// the description of the question, which holds the text of each option.
type AnswerRow = Queued & {
	question: string;
	waiting: string;
	description: string;
	option: number;
	reason: string;
};

const pendingAnswers = async (tx: Tx, terminals: string[]): Promise<Delivery[]> => {
	const found = await rows<AnswerRow>(
		tx,
		sql`SELECT ${deliveryColumns}, answer.option, answer.reason, question.description,
			question_root.key || '-' || question.number AS question,
			waiting_root.key || '-' || waiting.number AS waiting
		FROM review_deliveries delivery
		JOIN agent_runs run ON run.id = delivery.run_id
		JOIN tickets waiting ON waiting.id = run.ticket_id
		JOIN projects waiting_root ON waiting_root.id = waiting.root_id
		JOIN ticket_answers answer ON answer.id = delivery.answer_id
		JOIN tickets question ON question.id = answer.ticket_id
		JOIN projects question_root ON question_root.id = question.root_id
		WHERE delivery.state = 'pending' AND delivery.answer_id IS NOT NULL AND ${due}
			AND ${runningTerminals(terminals)}
		ORDER BY delivery.id LIMIT 20`,
	);
	return found.map((row) => ({ ...row, ids: [row.id], text: answerMessage(row) }));
};

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
		JOIN agent_runs run ON run.id = delivery.run_id
		JOIN review_submissions submission ON submission.id = delivery.review_id
		JOIN pull_requests pr ON pr.id = submission.pr_id
		WHERE delivery.state = 'pending' AND delivery.review_id IS NOT NULL AND ${due}
			AND ${runningTerminals(terminals)}
		ORDER BY delivery.id LIMIT 20`,
	);
	return found.map((row) => ({ ...row, ids: [row.id], text: reviewMessage(row) }));
};

// A queued comment of a person. The thread document holds the anchor and the
// text, so the message names the file, the line and the words without a
// second query. A reply carries the anchor of its thread.
type CommentRow = Queued & CommentNote & { url: string; prId: string };

// Every waiting comment of one agent becomes one message. The rows come back
// in the order a person wrote them, and the group keeps that order.
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
		JOIN agent_runs run ON run.id = delivery.run_id
		JOIN review_threads thread ON thread.id = delivery.thread_id
		JOIN pull_requests pr ON pr.id = thread.pr_id
		WHERE delivery.state = 'pending' AND delivery.thread_message_id IS NOT NULL AND ${due}
			AND ${runningTerminals(terminals)}
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
// `sessions` is the list the execution service reports for this machine. A
// row holds either the answer of a question ticket or a review submission,
// and both reach the agent the same way.
export const dispatchDeliveries = async (
	ctx: IoCtx,
	sessions: RuntimeProcessStatus[],
	send = prepareSend,
	preset = nativePreset,
) => {
	await ctx.newTx(failDeliveriesOfClosedRuns);
	const ready = sessions
		.filter((session) => session.status === "running" && session.controllable)
		.map((session) => session.id);
	if (ready.length === 0) return;
	const pending = await ctx.newTx(async (tx) => [
		...(await pendingAnswers(tx, ready)),
		...(await pendingReviews(tx, ready)),
		...(await pendingComments(tx, ready)),
	]);
	for (const delivery of pending) {
		const claimed = await ctx.newTx((tx) =>
			rows<{ id: string }>(
				tx,
				sql`UPDATE review_deliveries SET state = 'sending'
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
		await ctx.newTx((tx) =>
			tx.execute(
				sql`UPDATE review_deliveries SET state = ${outcome.state}, error = ${outcome.error}
				WHERE id IN (${list(claimed.map((row) => row.id))})`,
			),
		);
		// The review page draws the state of each comment, so the page that
		// waits for this send learns the new word.
		if (delivery.prId) await ctx.newTx((tx) => changed(ctx, tx, delivery.prId!));
	}
};
