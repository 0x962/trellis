import type { Tx } from "../../db/tx.ts";
import { prepareSend } from "../agentRuns/communication.ts";
import type { ServiceCtx } from "../support.ts";
import { claim, complete } from "./controller.ts";
import { managerMessage } from "./message.ts";
import { dispatchMessageId } from "./messageId.ts";
import { reconcile } from "./reconcile.ts";
import { sendDeadline } from "./sendDeadline.ts";
import type { Dispatch } from "./types.ts";

type Ctx = ServiceCtx & { publicUrl: string };

export const dispatch = async (ctx: Ctx) => {
	await ctx.newTx((tx) => reconcile({ now: ctx.now() }, tx));
	const deliveries: Dispatch[] = [];
	for (let i = 0; i < 20; i++) {
		const delivery = await ctx.newTx((tx) => claim({ now: ctx.now() }, tx, {}));
		if (!delivery) break;
		deliveries.push(delivery);
	}
	await Promise.all(
		deliveries.map(async (delivery) => {
			let state: "sent" | "unknown" = "sent";
			let error: string | null = null;
			try {
				await sendDeadline(
					prepareSend(ctx, {
						id: delivery.runId!,
						text: managerMessage(delivery),
						messageId: dispatchMessageId(delivery),
						expectedTerminalId: delivery.terminalId!,
						expectedSessionId: delivery.sessionId,
					}),
				);
			} catch (cause) {
				state = "unknown";
				error = cause instanceof Error ? cause.message : String(cause);
			}
			await ctx.newTx((tx) =>
				complete({ now: ctx.now() }, tx, { id: delivery.id, generation: delivery.generation, state, error }),
			);
		}),
	);
	return {};
};

export const finished = (_ctx: Ctx, _tx: Tx, input: Record<string, never>) => Promise.resolve(input);
