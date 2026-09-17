import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { nativePreset } from "../../agents/native/harnessHost.ts";
import { rows } from "../../db/queries/support.ts";
import { prepareSend } from "../agentRuns/communication.ts";
import { sendDeadline } from "../controller/sendDeadline.ts";
import { unconfirmedDelivery } from "../deliveries/sentences.ts";
import type { ServiceCtx } from "../support.ts";
import { chatBatchMessageId } from "./batchMessageId.ts";
import { type ContextLine, chatBatchText, type PendingLine } from "./text.ts";

// The context that travels with a delivery: the messages of the same
// channel that came before the first pending line, at most this many and
// no older than this window before that line.
export const CONTEXT_LIMIT = 6;
export const CONTEXT_WINDOW_MINUTES = 30;

// The recent messages of each channel a batch touches, oldest first, so the
// agent reads what the new lines answer. A pending line is never context.
const contextFor = async (ctx: ServiceCtx, projectId: string, claimed: PendingLine[]) => {
	const context: ContextLine[] = [];
	const channels = new Map<string, PendingLine>();
	for (const line of claimed) {
		const first = channels.get(line.channel);
		if (first === undefined || line.messageId < first.messageId) channels.set(line.channel, line);
	}
	for (const [channel, first] of channels) {
		const found = await ctx.newTx((tx) =>
			rows<ContextLine>(
				tx,
				sql`SELECT m.id AS "messageId", m.channel, m.body, m.actor_name AS "actorName", m.actor_kind AS "actorKind",
				author.persona_name AS "actorDisplayName",
				to_char(m.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
				FROM chat_messages m LEFT JOIN agent_runs author ON m.actor_kind='agent' AND author.id=m.actor_name
				WHERE m.project_id=${projectId} AND m.channel=${channel} AND m.id < ${first.messageId}
				AND m.created_at >= ${first.createdAt}::timestamptz - make_interval(mins => ${CONTEXT_WINDOW_MINUTES})
				ORDER BY m.id DESC LIMIT ${CONTEXT_LIMIT}`,
			),
		);
		context.push(...found.reverse());
	}
	return context.sort((a, b) => (a.messageId < b.messageId ? -1 : 1));
};

type Delivery = { id: string; messageId: string; projectId: string; channel: string };

type Recipient = {
	runId: string;
	terminalId: string;
	sessionId: string | null;
	personaName: string;
	kind: string;
	projectPath: string;
};

// Sends every pending chat message to its live agents. One agent receives
// all of its pending lines in one send, so a busy room costs one turn and
// not one turn per line. The rules of a comment mention apply: a closed or
// replaced session fails its rows, a paused host and an archived room hold
// them, a working agent receives its lines at once, and a send with no
// receipt leaves the rows unknown. A batch that holds a direct line, one
// whose message mentioned the agent, interrupts the agent's current turn
// first. A custom terminal has no interrupt, so it receives the lines as
// typed input.
export const dispatchChat = async (
	ctx: ServiceCtx,
	sessions: RuntimeProcessStatus[],
	send = prepareSend,
	preset = nativePreset,
) => {
	await ctx.newTx((tx) =>
		tx.execute(sql`DELETE FROM chat_deliveries d USING chat_messages m,agent_runs r
		WHERE d.message_id=m.id AND d.run_id=r.id AND d.state='pending'
		AND r.kind='manager' AND m.actor_kind<>'human'`),
	);
	await ctx.newTx((tx) =>
		tx.execute(sql`UPDATE chat_deliveries d SET session_id=r.session_id FROM agent_runs r
		WHERE d.run_id=r.id AND d.state='pending' AND d.session_id IS NULL AND r.session_id IS NOT NULL
		AND d.terminal_id=r.terminal_id AND r.closed_at IS NULL`),
	);
	const failed = await ctx.newTx((tx) =>
		rows<Delivery>(
			tx,
			sql`UPDATE chat_deliveries d SET state='failed',error='The agent session closed or changed before delivery.'
		FROM agent_runs r, chat_messages m WHERE d.run_id=r.id AND d.message_id=m.id AND d.state='pending'
		AND (r.closed_at IS NOT NULL OR r.terminal_id IS DISTINCT FROM d.terminal_id OR r.session_id IS DISTINCT FROM d.session_id)
		RETURNING d.id, m.id AS "messageId", m.project_id AS "projectId", m.channel`,
		),
	);
	for (const delivery of failed) emitChanged(ctx, delivery);
	const ready = sessions
		.filter((session) => session.status === "running" && session.controllable)
		.map((session) => session.id);
	if (ready.length === 0) return;
	const recipients = await ctx.newTx((tx) =>
		rows<Recipient>(
			tx,
			sql`SELECT DISTINCT d.run_id AS "runId", d.terminal_id AS "terminalId", d.session_id AS "sessionId",
			d.persona_name AS "personaName", r.kind, r.project_path AS "projectPath"
			FROM chat_deliveries d JOIN chat_messages m ON m.id=d.message_id JOIN agent_runs r ON r.id=d.run_id
		WHERE d.state='pending' AND d.terminal_id IN (${sql.join(
			ready.map((id) => sql`${id}`),
			sql`,`,
		)})
		AND NOT EXISTS (SELECT 1 FROM projects WHERE id=m.project_id AND archived_at IS NOT NULL)
		ORDER BY d.run_id LIMIT 20`,
		),
	);
	for (const recipient of recipients) {
		const claimed = await ctx.newTx((tx) =>
			rows<PendingLine & Delivery>(
				tx,
				sql`UPDATE chat_deliveries d SET state='sending' FROM chat_messages m
				LEFT JOIN agent_runs author ON m.actor_kind='agent' AND author.id=m.actor_name
				WHERE d.message_id=m.id AND d.run_id=${recipient.runId} AND d.state='pending'
				RETURNING d.id, d.direct, m.id AS "messageId", m.project_id AS "projectId", m.channel, m.body,
				m.actor_name AS "actorName", m.actor_kind AS "actorKind", author.persona_name AS "actorDisplayName",
				to_char(m.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"`,
			),
		);
		if (claimed.length === 0) continue;
		claimed.sort((a, b) => (a.messageId < b.messageId ? -1 : 1));
		const context = await contextFor(ctx, claimed[0]!.projectId, claimed);
		const direct = claimed.some((line) => line.direct);
		const interrupt = direct && (await preset(ctx.home, recipient.terminalId)) !== "custom";
		let state = "sent";
		let error: string | null = null;
		try {
			await sendDeadline(
				send(ctx, {
					id: recipient.runId,
					text: chatBatchText(recipient, claimed, context),
					messageId: chatBatchMessageId(claimed.map((line) => line.id)),
					interrupt,
					expectedTerminalId: recipient.terminalId,
					expectedSessionId: recipient.sessionId,
				}),
			);
		} catch {
			state = "unknown";
			error = unconfirmedDelivery;
		}
		await ctx.newTx((tx) =>
			tx.execute(
				sql`UPDATE chat_deliveries SET state=${state},error=${error} WHERE id IN (${sql.join(
					claimed.map((line) => sql`${line.id}`),
					sql`,`,
				)})`,
			),
		);
		for (const line of claimed) emitChanged(ctx, line);
	}
};

const emitChanged = (ctx: ServiceCtx, delivery: Delivery) =>
	ctx.emit({ type: "chat.delivery", id: delivery.messageId, projectId: delivery.projectId, channel: delivery.channel });
