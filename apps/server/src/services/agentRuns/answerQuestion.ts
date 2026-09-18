import { AgentAnswerInputSchema } from "@trellis/api";
import { nativeHost } from "../../agents/native/harnessHost.ts";
import { fail } from "../../errors.ts";
import type { IoCtx } from "../support.ts";
import { getRun } from "./queries.ts";

export async function answerQuestion(ctx: IoCtx, value: unknown) {
	const input = AgentAnswerInputSchema.parse(value);
	const run = await ctx.newTx((tx) => getRun(tx, input.id));
	if (run.terminalId !== input.attemptId)
		throw fail("SESSION_ATTENTION_CHANGED", { reason: "The session attempt changed." });
	await nativeHost(ctx.home).answer(input.attemptId, input.requestId, input.answers, input.cancel);
	return { id: input.id };
}
