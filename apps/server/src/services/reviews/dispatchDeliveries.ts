import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { nativePreset } from "../../agents/native/harnessHost.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { prepareSend } from "../agentRuns/communication.ts";
import { sendDeadline } from "../deliveries/sendDeadline.ts";
import { closedBeforeDelivery, unconfirmedDelivery } from "../deliveries/sentences.ts";
import type { IoCtx } from "../support.ts";
import { answerMessage, reviewMessage } from "./deliveryMessage.ts";
import { deliveryMessageId } from "./deliveryMessageId.ts";

// One queued message with the agent run that waits for it. `terminalId` and
// `sessionId` come from `agent_runs` at this moment, and the send refuses the
// message when either changes before the bytes leave. `text` is what the
// agent reads.
type Delivery = {
	id: string;
	runId: string;
	terminalId: string;
	sessionId: string | null;
	text: string;
};

// The columns that every pending row shares.
const deliveryColumns = sql`delivery.id, delivery.run_id AS "runId", run.terminal_id AS "terminalId",
	run.session_id AS "sessionId"`;

const runningTerminals = (terminals: string[]) =>
	sql`run.terminal_id IN (${sql.join(
		terminals.map((id) => sql`${id}`),
		sql`,`,
	)})`;

const failDeliveriesOfClosedRuns = (tx: Tx) =>
	tx.execute(
		sql`UPDATE review_deliveries delivery SET state = 'failed', error = ${closedBeforeDelivery}
		FROM agent_runs run
		WHERE delivery.run_id = run.id AND delivery.state = 'pending' AND run.closed_at IS NOT NULL`,
	);

// A queued answer of a question ticket. `question` is the ticket that holds
// the answer comment, and `waiting` is the ticket the run works on.
type AnswerRow = Omit<Delivery, "text"> & { commentId: string; question: string; waiting: string };

const pendingAnswers = async (tx: Tx, terminals: string[]): Promise<Delivery[]> => {
	const found = await rows<AnswerRow>(
		tx,
		sql`SELECT ${deliveryColumns}, comment.id AS "commentId",
			question_root.key || '-' || question.number AS question,
			waiting_root.key || '-' || waiting.number AS waiting
		FROM review_deliveries delivery
		JOIN agent_runs run ON run.id = delivery.run_id
		JOIN tickets waiting ON waiting.id = run.ticket_id
		JOIN projects waiting_root ON waiting_root.id = waiting.root_id
		JOIN comments comment ON comment.id = delivery.answer_comment_id
		JOIN tickets question ON question.id = comment.ticket_id
		JOIN projects question_root ON question_root.id = question.root_id
		WHERE delivery.state = 'pending' AND delivery.answer_comment_id IS NOT NULL AND ${runningTerminals(terminals)}
		ORDER BY delivery.id LIMIT 20`,
	);
	return found.map((row) => ({ ...row, text: answerMessage(row) }));
};

// A queued review submission. The stored document holds the pull request
// address and the threads the submission carried, so the message names both
// without a second query.
type ReviewRow = Omit<Delivery, "text"> & { url: string; drafts: number };

const pendingReviews = async (tx: Tx, terminals: string[]): Promise<Delivery[]> => {
	const found = await rows<ReviewRow>(
		tx,
		sql`SELECT ${deliveryColumns},
			pr.url AS "url",
			jsonb_array_length(submission.document -> 'threads') AS "drafts"
		FROM review_deliveries delivery
		JOIN agent_runs run ON run.id = delivery.run_id
		JOIN review_submissions submission ON submission.id = delivery.review_id
		JOIN pull_requests pr ON pr.id = submission.pr_id
		WHERE delivery.state = 'pending' AND delivery.review_id IS NOT NULL AND ${runningTerminals(terminals)}
		ORDER BY delivery.id LIMIT 20`,
	);
	return found.map((row) => ({ ...row, text: reviewMessage(row) }));
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
	]);
	for (const delivery of pending) {
		const claimed = await ctx.newTx((tx) =>
			rows(
				tx,
				sql`UPDATE review_deliveries SET state = 'sending' WHERE id = ${delivery.id} AND state = 'pending' RETURNING id`,
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
					messageId: deliveryMessageId(delivery.id),
					expectedTerminalId: delivery.terminalId,
					expectedSessionId: delivery.sessionId,
				}),
			);
		} catch (failure) {
			outcome = outcomeOf(failure);
		}
		await ctx.newTx((tx) =>
			tx.execute(
				sql`UPDATE review_deliveries SET state = ${outcome.state}, error = ${outcome.error} WHERE id = ${delivery.id}`,
			),
		);
	}
};
