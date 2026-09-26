import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { nativeClient } from "../../../agents/native/connection.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { prepareSend } from "../../agentRuns/communication.ts";
import { readRuntimeSessionsRequired } from "../../agentRuns/liveState.ts";
import type { IoCtx } from "../../support.ts";
import { completeWatchBatch, reserveWatchBatch } from "../watchBatch";

type DispatchDeps = {
	read: typeof readRuntimeSessionsRequired;
	inspect: (id: string) => Promise<Pick<RuntimeProcessStatus, "acknowledgedMessageIds">>;
	send: (ctx: IoCtx, input: Parameters<typeof prepareSend>[1]) => Promise<{ id: string; skipped?: boolean }>;
};

export async function prepareWatchDispatch(
	ctx: IoCtx,
	_input: Record<string, never>,
	deps: DispatchDeps = {
		read: readRuntimeSessionsRequired,
		inspect: (id: string) => nativeClient(ctx.home).inspect(id),
		send: prepareSend,
	},
) {
	const watches = await ctx.newTx((tx) =>
		rows<{ pageId: string; terminalId: string; reservedTerminalId: string | null }>(
			tx,
			sql`SELECT w.page_id AS "pageId", run.terminal_id AS "terminalId", w.reservation_payload->>'terminalId' AS "reservedTerminalId"
		FROM page_watches w JOIN agent_runs run ON run.id = w.agent_id
		JOIN pages p ON p.id = w.page_id JOIN projects project ON project.id = p.project_id
		WHERE run.closed_at IS NULL AND run.terminal_id IS NOT NULL AND p.deleted_at IS NULL
		AND project.archived_at IS NULL
		AND (w.reservation_id IS NOT NULL OR EXISTS (
			SELECT 1 FROM page_comments c JOIN page_comment_threads thread ON thread.id = c.thread_id
			WHERE thread.page_id = w.page_id AND c.actor_kind = 'human' AND c.deleted_at IS NULL
			AND (w.cursor_at IS NULL OR (c.created_at, c.id) > (w.cursor_at, w.cursor_id))))
		AND (w.reservation_expires_at IS NULL OR w.reservation_expires_at <= ${ctx.now()})`,
		),
	);
	if (watches.length === 0) return {};
	const sessions = await deps.read(ctx.home, { ids: [...new Set(watches.map((w) => w.terminalId))] });
	const live = new Map<string, RuntimeProcessStatus>(sessions.map((session) => [session.id, session]));
	for (const watch of watches) {
		const process = live.get(watch.terminalId);
		if (watch.reservedTerminalId === null && (process?.status !== "running" || !process.controllable)) continue;
		const batch = await ctx.newTx((tx) =>
			reserveWatchBatch(tx, { pageId: watch.pageId, now: ctx.now(), publicUrl: ctx.publicUrl }),
		);
		if (batch === null) continue;
		try {
			const prior = await deps.inspect(batch.payload.terminalId);
			if (!prior.acknowledgedMessageIds.includes(batch.messageId)) {
				if (batch.payload.terminalId !== watch.terminalId)
					throw new Error(
						"The previous watcher process has no receipt for this batch. Inspect that process before a resend.",
					);
				if (process?.status !== "running" || !process.controllable) continue;
				await deps.send(ctx, {
					id: batch.agentId,
					text: batch.payload.text,
					messageId: batch.messageId,
					expectedTerminalId: batch.payload.terminalId,
					expectedSessionId: batch.payload.sessionId,
				});
			}
		} catch (error) {
			ctx.log("Page comment delivery failed", {
				pageId: batch.pageId,
				messageId: batch.messageId,
				error: String(error),
			});
			continue;
		}
		await ctx.newTx((tx) => completeWatchBatch(tx, batch));
	}
	return {};
}

export const finishWatchDispatch = (_ctx: IoCtx, _tx: Tx, input: Record<string, never>) => Promise.resolve(input);
