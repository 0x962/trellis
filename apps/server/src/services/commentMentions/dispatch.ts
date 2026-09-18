import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { nativePreset } from "../../agents/native/harnessHost.ts";
import { rows } from "../../db/queries/support.ts";
import { prepareSend } from "../agentRuns/communication.ts";
import { sendDeadline } from "../deliveries/sendDeadline.ts";
import { unconfirmedDelivery } from "../deliveries/sentences.ts";
import type { ServiceCtx } from "../support.ts";

type Delivery = {
	id: string;
	runId: string;
	terminalId: string;
	sessionId: string | null;
	commentId: string;
	ticketId: string;
	projectId: string;
	parentId: string | null;
	agentName: string;
};

export const dispatchMentions = async (
	ctx: ServiceCtx,
	sessions: RuntimeProcessStatus[],
	send = prepareSend,
	preset = nativePreset,
) => {
	await ctx.newTx((tx) =>
		tx.execute(sql`UPDATE comment_deliveries d SET session_id=r.session_id FROM agent_runs r
		WHERE d.run_id=r.id AND d.state='pending' AND d.session_id IS NULL AND r.session_id IS NOT NULL
		AND d.terminal_id=r.terminal_id AND r.closed_at IS NULL`),
	);
	const changed = await ctx.newTx((tx) =>
		rows<Delivery>(
			tx,
			sql`UPDATE comment_deliveries d SET state='failed',error='The assigned agent session closed or changed before delivery.'
		FROM agent_runs r, comments c, tickets t WHERE d.run_id=r.id AND d.comment_id=c.id AND c.ticket_id=t.id AND d.state='pending'
		AND (r.closed_at IS NOT NULL OR r.terminal_id IS DISTINCT FROM d.terminal_id OR r.session_id IS DISTINCT FROM d.session_id)
		RETURNING d.id,c.id AS "commentId",c.ticket_id AS "ticketId",c.parent_id AS "parentId",t.project_id AS "projectId"`,
		),
	);
	for (const delivery of changed) emitChanged(ctx, delivery);
	const ready = sessions
		.filter((session) => session.status === "running" && session.controllable)
		.map((session) => session.id);
	if (ready.length === 0) return;
	const pending = await ctx.newTx((tx) =>
		rows<Delivery>(
			tx,
			sql`SELECT d.id,d.run_id AS "runId",d.terminal_id AS "terminalId",d.session_id AS "sessionId",d.agent_name AS "agentName",
			c.id AS "commentId",c.ticket_id AS "ticketId",c.parent_id AS "parentId",t.project_id AS "projectId"
			FROM comment_deliveries d JOIN comments c ON c.id=d.comment_id JOIN tickets t ON t.id=c.ticket_id JOIN agent_runs r ON r.id=d.run_id
		WHERE d.state='pending' AND d.terminal_id IN (${sql.join(
			ready.map((id) => sql`${id}`),
			sql`,`,
		)})
		AND NOT EXISTS (WITH RECURSIVE ancestors AS (
			SELECT id,parent_id,archived_at FROM projects WHERE id=t.project_id
			UNION ALL SELECT p.id,p.parent_id,p.archived_at FROM projects p JOIN ancestors a ON p.id=a.parent_id
		) SELECT 1 FROM ancestors WHERE archived_at IS NOT NULL)
		ORDER BY d.id LIMIT 20`,
		),
	);
	for (const delivery of pending) {
		const claimed = await ctx.newTx((tx) =>
			rows(
				tx,
				sql`UPDATE comment_deliveries SET state='sending' WHERE id=${delivery.id} AND state='pending' RETURNING id`,
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
					text: `trellis: @${delivery.agentName} has a ticket comment. Read: trellis thread show ${delivery.parentId ?? delivery.commentId}\nRespond to the comment on your assigned ticket.`,
					messageId: delivery.id,
					expectedTerminalId: delivery.terminalId,
					expectedSessionId: delivery.sessionId,
				}),
			);
		} catch {
			state = "unknown";
			error = unconfirmedDelivery;
		}
		await ctx.newTx((tx) =>
			tx.execute(sql`UPDATE comment_deliveries SET state=${state},error=${error} WHERE id=${delivery.id}`),
		);
		emitChanged(ctx, delivery);
	}
};

const emitChanged = (ctx: ServiceCtx, delivery: Delivery) =>
	ctx.emit({
		type: "comment.updated",
		id: delivery.commentId,
		ticketId: delivery.ticketId,
		projectId: delivery.projectId,
		parentId: delivery.parentId,
		threadId: delivery.parentId ?? delivery.commentId,
	});
