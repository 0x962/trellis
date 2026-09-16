import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import type { Tx } from "../../db/tx.ts";
import { prepareSend } from "../agentRuns/communication.ts";
import { readRuntimeSessions } from "../agentRuns/liveState.ts";
import { dispatchChat } from "../chat/dispatch.ts";
import { dispatchMentions } from "../commentMentions/dispatch.ts";
import { reconcileUnknownDeliveries } from "../deliveries/reconcileUnknown.ts";
import { unconfirmedDelivery } from "../deliveries/sentences.ts";
import { manage } from "../manager/manager.ts";
import type { IoCtx } from "../support.ts";
import { agentContext } from "./agentContext/index.ts";
import { claim, complete, defer } from "./controller.ts";
import { coordination } from "./coordination.ts";
import { managerMessage } from "./message.ts";
import { dispatchMessageId } from "./messageId.ts";
import { reconcile } from "./reconcile.ts";
import { sendDeadline } from "./sendDeadline.ts";
import type { Dispatch } from "./types.ts";

type Ctx = IoCtx;

const dispatchManagers = async (ctx: Ctx, sessions: RuntimeProcessStatus[]) => {
	await ctx.newTx((tx) => reconcile({ now: ctx.now() }, tx, { sessions }));
	await reconcileUnknownDeliveries(ctx, { sessions });
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
				error = unconfirmedDelivery;
				if (!attempted) {
					await ctx.newTx((tx) =>
						defer({ now: ctx.now() }, tx, {
							id: delivery.id,
							generation: delivery.generation,
							error: cause instanceof Error ? cause.message : String(cause),
						}),
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

type Dependencies = {
	readSessions: typeof readRuntimeSessions;
	manage: typeof manage;
	mentions: (ctx: Ctx, sessions: RuntimeProcessStatus[]) => Promise<unknown>;
	chat: (ctx: Ctx, sessions: RuntimeProcessStatus[]) => Promise<unknown>;
	managers: (ctx: Ctx, sessions: RuntimeProcessStatus[]) => Promise<unknown>;
};
const defaults: Dependencies = {
	readSessions: readRuntimeSessions,
	manage,
	mentions: dispatchMentions,
	chat: dispatchChat,
	managers: dispatchManagers,
};

export const dispatch = async (ctx: Ctx, _input: Record<string, never> = {}, deps: Dependencies = defaults) => {
	const sessions = await deps.readSessions(ctx.home);
	const outcomes = await Promise.allSettled([
		deps.manage(ctx, { sessions }),
		deps.mentions(ctx, sessions),
		deps.chat(ctx, sessions),
		deps.managers(ctx, sessions),
	]);
	const errors = outcomes.flatMap((outcome) => (outcome.status === "rejected" ? [outcome.reason] : []));
	if (errors.length)
		throw new AggregateError(
			errors,
			errors.map((error) => (error instanceof Error ? error.message : String(error))).join("\n"),
		);
	return {};
};

export const finished = (_ctx: Ctx, _tx: Tx, input: Record<string, never>) => Promise.resolve(input);
