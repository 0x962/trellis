import type { Tx } from "../../db/tx.ts";
import { prepareSend } from "../agentRuns/communication.ts";
import { readRuntimeSessions } from "../agentRuns/liveState.ts";
import { dispatchChat } from "../chat/dispatch.ts";
import { dispatchMentions } from "../commentMentions/dispatch.ts";
import type { ServiceCtx } from "../support.ts";
import { agentContext } from "./agentContext/index.ts";
import { claim, complete, defer } from "./controller.ts";
import { coordination } from "./coordination.ts";
import { managerMessage } from "./message.ts";
import { dispatchMessageId } from "./messageId.ts";
import { reconcile } from "./reconcile.ts";
import { sendDeadline } from "./sendDeadline.ts";
import type { Dispatch } from "./types.ts";

type Ctx = ServiceCtx & { publicUrl: string };

export const dispatch = async (ctx: Ctx) => {
	const sessions = await readRuntimeSessions(ctx.home);
	await dispatchMentions(ctx, sessions);
	await dispatchChat(ctx, sessions);
	await ctx.newTx((tx) => reconcile({ now: ctx.now() }, tx, { sessions }));
	const deliveries: Dispatch[] = [];
	for (let i = 0; i < 20; i++) {
		const delivery = await ctx.newTx((tx) => claim({ now: ctx.now() }, tx, { sessions }));
		if (!delivery) break;
		deliveries.push(delivery);
	}
	await Promise.all(
		deliveries.map(async (delivery) => {
			let state: "sent" | "unknown" | "canceled" = "sent";
			let attempted = false;
			let error: string | null = null;
			try {
				const context = await ctx.newTx((tx) => coordination(tx, delivery));
				const agents = await ctx.newTx((tx) =>
					agentContext({ now: ctx.now() }, tx, { sessions, projectId: delivery.projectId, runId: delivery.runId! }),
				);
				attempted = true;
				const sent = await sendDeadline(
					prepareSend(ctx, {
						id: delivery.runId!,
						text: managerMessage(delivery, context, agents),
						messageId: dispatchMessageId(delivery),
						expectedTerminalId: delivery.terminalId!,
						expectedSessionId: delivery.sessionId,
						idleForMs: delivery.events.length === 0 && delivery.nextActions.length === 0 ? 120_000 : undefined,
					}),
				);
				if (sent.skipped) state = "canceled";
			} catch (cause) {
				state = "unknown";
				error = cause instanceof Error ? cause.message : String(cause);
				if (!attempted) {
					await ctx.newTx((tx) =>
						defer({ now: ctx.now() }, tx, { id: delivery.id, generation: delivery.generation, error }),
					);
					return;
				}
			}
			await ctx.newTx((tx) =>
				complete({ now: ctx.now() }, tx, { id: delivery.id, generation: delivery.generation, state, error }),
			);
		}),
	);
	return {};
};

export const finished = (_ctx: Ctx, _tx: Tx, input: Record<string, never>) => Promise.resolve(input);
