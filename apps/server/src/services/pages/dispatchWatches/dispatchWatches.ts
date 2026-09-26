import type { RuntimeMessageState } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { nativeClient } from "../../../agents/native/connection.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import * as agentRuns from "../../agentRuns.ts";
import type { IoCtx } from "../../support.ts";
import { completeCommentBatch, reassignCommentBatch, reserveCommentBatch } from "../watchBatch";

type DispatchDeps = {
	read: typeof agentRuns.deliveryProcesses;
	receipt: (id: string, messageId: string) => Promise<RuntimeMessageState>;
	send: (ctx: IoCtx, input: Parameters<typeof agentRuns.send>[1]) => Promise<{ id: string; skipped?: boolean }>;
};

export async function prepareWatchDispatch(
	ctx: IoCtx,
	_input: Record<string, never>,
	deps: DispatchDeps = {
		read: agentRuns.deliveryProcesses,
		receipt: (id, messageId) => nativeClient(ctx.home).hasMessage(id, messageId),
		send: agentRuns.send,
	},
) {
	const watches = await ctx.newTx(async (tx) => {
		const pending = await rows<{
			pageId: string;
			agentId: string;
			messageId: string | null;
			reservedTerminalId: string | null;
		}>(
			tx,
			sql`SELECT w.page_id AS "pageId", w.agent_id AS "agentId", w.reservation_id AS "messageId",
			w.reservation_payload->>'terminalId' AS "reservedTerminalId"
			FROM page_watches w JOIN pages p ON p.id = w.page_id JOIN projects project ON project.id = p.project_id
			WHERE p.deleted_at IS NULL AND project.archived_at IS NULL
			AND (w.reservation_id IS NOT NULL OR EXISTS (
				SELECT 1 FROM page_comments c JOIN page_comment_threads thread ON thread.id = c.thread_id
				WHERE thread.page_id = w.page_id AND c.actor_kind = 'human' AND c.deleted_at IS NULL
				AND (w.cursor_at IS NULL OR (c.created_at, c.id) > (w.cursor_at, w.cursor_id))))
			AND (w.reservation_expires_at IS NULL OR w.reservation_expires_at <= ${ctx.now()})`,
		);
		return Promise.all(
			pending.map(async (watch) => ({
				...watch,
				target: await agentRuns.deliveryTarget(ctx.core, tx, { id: watch.agentId }),
			})),
		);
	});
	if (watches.length === 0) return {};
	const sessions = await deps.read(ctx.home, {
		ids: [...new Set(watches.flatMap((w) => (w.target ? [w.target.terminalId] : [])))],
	});
	const live = new Map(sessions.map((session) => [session.id, session]));
	for (const watch of watches) {
		const fields = {
			pageId: watch.pageId,
			agentId: watch.agentId,
			terminalId: watch.target?.terminalId ?? null,
			messageId: watch.messageId,
		};
		const process = watch.target && live.get(watch.target.terminalId);
		if (
			watch.target === null ||
			(watch.reservedTerminalId === null && (process?.status !== "running" || !process.controllable))
		) {
			ctx.log("Page comment delivery skipped", { ...fields, reason: "Agent process is stopped" });
			continue;
		}
		let batch = await ctx.newTx((tx) =>
			reserveCommentBatch(ctx.core, tx, { pageId: watch.pageId, now: ctx.now(), publicUrl: ctx.publicUrl }),
		);
		if (batch === null) {
			ctx.log("Page comment reservation skipped", fields);
			continue;
		}
		fields.messageId = batch.messageId;
		fields.terminalId = batch.payload.terminalId;
		ctx.log("Page comments reserved", fields);
		let prior: RuntimeMessageState;
		try {
			prior = await deps.receipt(batch.payload.terminalId, batch.messageId);
		} catch (error) {
			ctx.log("Page comment receipt failed", { ...fields, error: String(error) });
			continue;
		}
		if (!prior.delivered) {
			if (batch.payload.terminalId !== watch.target.terminalId) {
				if (prior.registered || prior.status !== "exited") {
					ctx.log("Page comment delivery held", {
						...fields,
						reason: "The prior session can still contain this message",
					});
					continue;
				}
				const reserved = batch;
				batch = await ctx.newTx((tx) => reassignCommentBatch(ctx.core, tx, reserved, watch.target!.terminalId));
				if (batch === null) {
					ctx.log("Page comment reassignment skipped", fields);
					continue;
				}
				fields.terminalId = batch.payload.terminalId;
				ctx.log("Page comments reassigned", fields);
			}
			if (process?.status !== "running" || !process.controllable) {
				ctx.log("Page comment delivery skipped", { ...fields, reason: "Agent process is stopped" });
				continue;
			}
			try {
				await deps.send(ctx, {
					id: batch.agentId,
					text: batch.payload.text,
					messageId: batch.messageId,
					expectedTerminalId: batch.payload.terminalId,
					expectedSessionId: batch.payload.sessionId,
				});
			} catch (error) {
				ctx.log("Page comment delivery failed", { ...fields, error: String(error) });
				continue;
			}
			ctx.log("Page comments accepted", fields);
		}
		const completed = batch;
		await ctx.newTx((tx) => completeCommentBatch(tx, completed));
		ctx.log("Page comment cursor advanced", fields);
	}
	return {};
}

export const finishWatchDispatch = (_ctx: IoCtx, _tx: Tx, input: Record<string, never>) => Promise.resolve(input);
