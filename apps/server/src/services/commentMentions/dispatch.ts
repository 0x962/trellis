import { ORPCError } from "@orpc/server";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import { prepareStart } from "../agentRuns/agentRuns.ts";
import { prepareSend } from "../agentRuns/communication.ts";
import { getRun } from "../agentRuns/queries.ts";
import type { StartInput } from "../agentRuns/reserve.ts";
import { sendDeadline } from "../controller/sendDeadline.ts";
import { unconfirmedDelivery } from "../deliveries/sentences.ts";
import type { ServiceCtx } from "../support.ts";

type EventDelivery = {
	id: string;
	commentId: string;
	ticketId: string;
	projectId: string;
	parentId: string | null;
	personaName: string;
};

type Delivery = EventDelivery & {
	runId: string;
	terminalId: string;
	sessionId: string | null;
	kind: string;
};

type StartDelivery = EventDelivery & {
	personaId: string;
	body: string;
	kind: string;
};

type Start = (ctx: ServiceCtx, input: StartInput) => Promise<{ id: string }>;

const startAssignment: Start = (ctx, input) =>
	prepareStart(ctx as unknown as Parameters<typeof prepareStart>[0], input);

// A refused start carries its reason inside the oRPC error, and the comment
// shows that sentence. A plain `cause.message` would read "Input validation
// failed" and name nothing the reader can act on.
const startError = (cause: unknown) => {
	if (cause instanceof ORPCError) {
		if (cause.code === "INPUT_VALIDATION_FAILED")
			return (cause.data as { issues: { message: string }[] }).issues[0]?.message ?? cause.message;
		if (cause.code === "DUPLICATE") return `The ${(cause.data as { field: string }).field} stopped the start.`;
	}
	return cause instanceof Error ? cause.message : String(cause);
};

export const dispatchMentions = async (
	ctx: ServiceCtx,
	sessions: RuntimeProcessStatus[],
	send = prepareSend,
	start = startAssignment,
) => {
	const deleted = await ctx.newTx((tx) =>
		rows<EventDelivery>(
			tx,
			sql`UPDATE comment_deliveries d
			SET state='failed',error='The persona was deleted before Trellis started the assignment.'
			FROM comments c,tickets t
			WHERE d.comment_id=c.id AND c.ticket_id=t.id AND d.state='pending' AND d.run_id IS NULL
			AND NOT EXISTS (SELECT 1 FROM personas p WHERE p.id=d.persona_id)
			RETURNING d.id,c.id AS "commentId",c.ticket_id AS "ticketId",c.parent_id AS "parentId",
				t.project_id AS "projectId",d.persona_name AS "personaName"`,
		),
	);
	for (const delivery of deleted) emitChanged(ctx, delivery);
	const starts = await ctx.newTx((tx) =>
		rows<StartDelivery>(
			tx,
			sql`SELECT d.id,d.persona_id AS "personaId",d.persona_name AS "personaName",c.body,
			c.id AS "commentId",c.ticket_id AS "ticketId",c.parent_id AS "parentId",t.project_id AS "projectId",p.kind
			FROM comment_deliveries d JOIN comments c ON c.id=d.comment_id JOIN tickets t ON t.id=c.ticket_id
			JOIN personas p ON p.id=d.persona_id
			WHERE d.state='pending' AND d.run_id IS NULL
			AND NOT EXISTS (WITH RECURSIVE ancestors AS (
				SELECT id,parent_id,archived_at FROM projects WHERE id=t.project_id
				UNION ALL SELECT p.id,p.parent_id,p.archived_at FROM projects p JOIN ancestors a ON p.id=a.parent_id
			) SELECT 1 FROM ancestors WHERE archived_at IS NOT NULL)
			ORDER BY d.id LIMIT 20`,
		),
	);
	for (const delivery of starts) {
		const claimed = await ctx.newTx((tx) =>
			rows(
				tx,
				sql`UPDATE comment_deliveries SET state='sending' WHERE id=${delivery.id} AND state='pending' RETURNING id`,
			),
		);
		if (claimed.length === 0) continue;
		try {
			const { id } = await start(ctx, {
				personaId: delivery.personaId,
				...(delivery.kind === "manager" ? { project: delivery.projectId } : { ticket: delivery.ticketId }),
				note: delivery.body.slice(0, 20_000),
				requestId: `mention-${delivery.commentId}-${delivery.personaId}`,
			});
			// A start can close the assignment before its process runs. The saved
			// error is the only account of that failure, so the comment shows it.
			const run = await ctx.newTx((tx) => getRun(tx, id));
			const failed = run.closedAt !== null && run.error !== null;
			await ctx.newTx((tx) =>
				tx.execute(sql`UPDATE comment_deliveries SET run_id=${run.id},terminal_id=${run.terminalId},
					session_id=${run.sessionId},state=${failed ? "failed" : "sent"},error=${failed ? run.error : null}
					WHERE id=${delivery.id}`),
			);
		} catch (cause) {
			await ctx.newTx((tx) =>
				tx.execute(
					sql`UPDATE comment_deliveries SET state='failed',error=${startError(cause)} WHERE id=${delivery.id}`,
				),
			);
		}
		emitChanged(ctx, delivery);
	}
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
			sql`SELECT d.id,d.run_id AS "runId",d.terminal_id AS "terminalId",d.session_id AS "sessionId",d.persona_name AS "personaName",
			c.id AS "commentId",c.ticket_id AS "ticketId",c.parent_id AS "parentId",t.project_id AS "projectId",r.kind
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
					text:
						delivery.kind === "manager"
							? JSON.stringify({
									type: "trellis.comment.mentioned",
									commentId: delivery.commentId,
									threadId: delivery.parentId ?? delivery.commentId,
									ticketId: delivery.ticketId,
									projectId: delivery.projectId,
									recipient: { runId: delivery.runId, personaName: delivery.personaName },
								})
							: `trellis: @${delivery.personaName} has a ticket comment. Read: trellis thread show ${delivery.parentId ?? delivery.commentId}\nRespond to the comment on your assigned ticket.`,
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

const emitChanged = (ctx: ServiceCtx, delivery: EventDelivery) =>
	ctx.emit({
		type: "comment.updated",
		id: delivery.commentId,
		ticketId: delivery.ticketId,
		projectId: delivery.projectId,
		parentId: delivery.parentId,
		threadId: delivery.parentId ?? delivery.commentId,
	});
