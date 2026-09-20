import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ensureNativeRuntime } from "../../agents/native/connection.ts";
import { nativeHost, nativePreset } from "../../agents/native/harnessHost.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { prepareSend } from "../agentRuns/communication.ts";
import { sendDeadline } from "../deliveries/sendDeadline.ts";
import { closedBeforeDelivery, unconfirmedDelivery } from "../deliveries/sentences.ts";
import type { IoCtx } from "../support.ts";
import { deliveryMessageId } from "./deliveryMessageId.ts";

// A queued answer with the agent run that waits for it. `question` is the
// ticket that holds the answer comment, and `waiting` is the ticket the run
// works on. `terminalId` and `sessionId` come from `agent_runs` at this
// moment, and the send refuses the message when either changes before the
// bytes leave.
type Pending = {
	id: string;
	attempt: number;
	runId: string;
	terminalId: string;
	sessionId: string | null;
	commentId: string;
	question: string;
	waiting: string;
};

const failClosedRuns = (tx: Tx) =>
	tx.execute(
		sql`UPDATE review_deliveries delivery SET state = 'failed', error = ${closedBeforeDelivery}
		FROM agent_runs run
		WHERE delivery.run_id = run.id AND delivery.state = 'pending' AND run.closed_at IS NOT NULL`,
	);

const pendingFor = (tx: Tx, terminals: string[]) =>
	rows<Pending>(
		tx,
		sql`SELECT delivery.id, delivery.attempt, delivery.run_id AS "runId", run.terminal_id AS "terminalId",
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
		WHERE delivery.state = 'pending' AND run.terminal_id IN (${sql.join(
			terminals.map((id) => sql`${id}`),
			sql`,`,
		)})
		ORDER BY delivery.id LIMIT 20`,
	);

// The message the agent reads in its terminal. It names the question, the
// command that prints the answer, and the ticket the agent works on.
const messageFor = (pending: Pending) =>
	`trellis: ${pending.question} has an answer. Read: trellis thread show ${pending.commentId}\nContinue the work on ${pending.waiting}.`;

// Sends every queued answer whose agent process runs and accepts input.
// `sessions` is the list the execution service reports for this machine.
export const dispatchDeliveries = async (
	ctx: IoCtx,
	sessions: RuntimeProcessStatus[],
	send = prepareSend,
	preset = nativePreset,
) => {
	await ctx.newTx(failClosedRuns);
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
		let state = "sent";
		let error: string | null = null;
		try {
			await sendDeadline(
				send(ctx, {
					id: delivery.runId,
					interrupt: (await preset(ctx.home, delivery.terminalId)) !== "custom",
					text: messageFor(delivery),
					messageId: deliveryMessageId(delivery),
					expectedTerminalId: delivery.terminalId,
					expectedSessionId: delivery.sessionId,
				}),
			);
		} catch {
			state = "unknown";
			error = unconfirmedDelivery;
		}
		await ctx.newTx((tx) =>
			tx.execute(sql`UPDATE review_deliveries SET state = ${state}, error = ${error} WHERE id = ${delivery.id}`),
		);
	}
};

export async function prepare(ctx: IoCtx) {
	const sessions = await nativeHost(ctx.home, undefined, await ensureNativeRuntime(ctx.home)).list();
	await dispatchDeliveries(ctx, sessions);
	return {};
}

export const finish = (_ctx: IoCtx, _tx: Tx, input: Record<string, never>) => Promise.resolve(input);
