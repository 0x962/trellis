import { nativeHost } from "../../agents/native/harnessHost.ts";
import type { Tx } from "../../db/tx.ts";
import { prepareSend } from "../agentRuns/communication.ts";
import { readRuntimeSessions } from "../agentRuns/liveState.ts";
import type { ServiceCtx } from "../support.ts";
import { agentContext } from "./agentContext/index.ts";
import { claim, complete, defer } from "./controller.ts";
import { managerMessage } from "./message.ts";
import { dispatchMessageId } from "./messageId.ts";
import { readySession } from "./readySession.ts";
import { reconcile } from "./reconcile.ts";
import { sendDeadline } from "./sendDeadline.ts";
import type { Dispatch } from "./types.ts";

type Ctx = ServiceCtx & { publicUrl: string };

export const dispatch = async (ctx: Ctx) => {
	const sessions = await readRuntimeSessions(ctx.home);
	await ctx.newTx((tx) => reconcile({ now: ctx.now() }, tx, { sessions }));
	const deliveries: Dispatch[] = [];
	for (let i = 0; i < 20; i++) {
		const delivery = await ctx.newTx((tx) => claim({ now: ctx.now() }, tx, { sessions }));
		if (!delivery) break;
		deliveries.push(delivery);
	}
	await Promise.all(
		deliveries.map(async (delivery) => {
			let state: "sent" | "unknown" = "sent";
			let attempted = false;
			let error: string | null = null;
			try {
				if (!readySession(await nativeHost(ctx.home).status(delivery.terminalId!))) {
					await ctx.newTx((tx) =>
						defer({ now: ctx.now() }, tx, { id: delivery.id, generation: delivery.generation, error: null }),
					);
					return;
				}
				const context = await ctx.newTx((tx) =>
					agentContext({ now: ctx.now() }, tx, { sessions, projectId: delivery.projectId, runId: delivery.runId! }),
				);
				attempted = true;
				await sendDeadline(
					prepareSend(ctx, {
						id: delivery.runId!,
						text: managerMessage(delivery, context),
						messageId: dispatchMessageId(delivery),
						requireIdle: true,
						expectedTerminalId: delivery.terminalId!,
						expectedSessionId: delivery.sessionId,
					}),
				);
			} catch (cause) {
				state = "unknown";
				error = cause instanceof Error ? cause.message : String(cause);
				if (!attempted || (cause as { code?: string }).code === "RUNTIME_BUSY") {
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
