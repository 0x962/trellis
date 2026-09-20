import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { nativePreset } from "../../agents/native/harnessHost.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { prepareSend } from "../agentRuns/communication.ts";
import { sendDeadline } from "../deliveries/sendDeadline.ts";
import { closedBeforeDelivery, unconfirmedDelivery } from "../deliveries/sentences.ts";
import type { IoCtx } from "../support.ts";
import { deliveryMessageId } from "./deliveryMessageId.ts";

// A row of `review_deliveries` holds either a review submission or the
// answer of a question ticket. Every statement here reads the answer rows,
// which the rule `answer_comment_id IS NOT NULL` selects. The rows that hold
// a review submission wait for their own sender.
const answerRows = sql`delivery.answer_comment_id IS NOT NULL`;

// A queued answer with the agent run that waits for it. `question` is the
// ticket that holds the answer comment, and `waiting` is the ticket the run
// works on. `terminalId` and `sessionId` come from `agent_runs` at this
// moment, and the send refuses the message when either changes before the
// bytes leave.
type AnswerDelivery = {
	id: string;
	runId: string;
	terminalId: string;
	sessionId: string | null;
	commentId: string;
	question: string;
	waiting: string;
};

const failDeliveriesOfClosedRuns = (tx: Tx) =>
	tx.execute(
		sql`UPDATE review_deliveries delivery SET state = 'failed', error = ${closedBeforeDelivery}
		FROM agent_runs run
		WHERE delivery.run_id = run.id AND delivery.state = 'pending' AND ${answerRows}
			AND run.closed_at IS NOT NULL`,
	);

const pendingFor = (tx: Tx, terminals: string[]) =>
	rows<AnswerDelivery>(
		tx,
		sql`SELECT delivery.id, delivery.run_id AS "runId", run.terminal_id AS "terminalId",
			run.session_id AS "sessionId", comment.id AS "commentId",
			question_root.key || '-' || question.number AS question,
			waiting_root.key || '-' || waiting.number AS waiting
		FROM review_deliveries delivery
		JOIN agent_runs run ON run.id = delivery.run_id
		JOIN tickets waiting ON waiting.id = run.ticket_id
		JOIN projects waiting_root ON waiting_root.id = waiting.root_id
		JOIN comments comment ON comment.id = delivery.answer_comment_id
		JOIN tickets question ON question.id = comment.ticket_id
		JOIN projects question_root ON question_root.id = question.root_id
		WHERE delivery.state = 'pending' AND ${answerRows} AND run.terminal_id IN (${sql.join(
			terminals.map((id) => sql`${id}`),
			sql`,`,
		)})
		ORDER BY delivery.id LIMIT 20`,
	);

// The message the agent reads in its terminal.
const messageFor = (delivery: AnswerDelivery) =>
	`trellis: ${delivery.question} has an answer. Read: trellis thread show ${delivery.commentId}\nContinue the work on ${delivery.waiting}.`;

// What one failed attempt writes on the row. `sendDeadline` rejects with the
// sentence `unconfirmedDelivery` when the send passes its 15 second limit,
// and only then can the agent hold the message already. Every other error
// means that no byte left this server, so the row says failed and keeps the
// text of the error, which is the one place a person reads the cause.
const outcomeOf = (failure: unknown) => {
	const text = failure instanceof Error ? failure.message : String(failure);
	return text === unconfirmedDelivery ? { state: "unknown", error: text } : { state: "failed", error: text };
};

// Sends every queued answer whose agent process runs and accepts input.
// `sessions` is the list the execution service reports for this machine.
export const dispatchAnswerDeliveries = async (
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
	const pending = await ctx.newTx((tx) => pendingFor(tx, ready));
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
					text: messageFor(delivery),
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
