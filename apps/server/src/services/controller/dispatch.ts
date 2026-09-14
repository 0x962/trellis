import type { Tx } from "../../db/tx.ts";
import { prepareSend } from "../agentRuns/communication.ts";
import type { ServiceCtx } from "../support.ts";
import { claim, complete } from "./controller.ts";
import { sendDeadline } from "./sendDeadline.ts";
import type { Dispatch } from "./types.ts";

type Ctx = ServiceCtx & { supersetBin: string; publicUrl: string };
const message = (delivery: Dispatch) => `trellis: Manager dispatch ${delivery.id}, generation ${delivery.generation}.
${delivery.events.length} ticket changes need your attention in project ${delivery.projectId}.
Read the affected tickets and their comments with the trellis CLI. Continue available work and report concrete results.
Do not start a second agent for an assignment that already has an active agent.
Use a stable --request-id for each worker assignment. Reuse it when a start result is uncertain.
Events: ${JSON.stringify(delivery.events)}`;

export const dispatch = async (ctx: Ctx) => {
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
						text: message(delivery),
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
