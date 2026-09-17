import type { SessionSendInput } from "@trellis/api";
import { prepareSend } from "../agentRuns/communication.ts";
import { getRun } from "../agentRuns/queries.ts";
import { assertSendTarget } from "../agentRuns/sendTarget.ts";
import { assertProjectActive } from "../refs.ts";
import type { IoCtx } from "../support.ts";
import { attachmentPrompt, prepareFiles } from "./attachments.ts";

export async function send(ctx: IoCtx, input: SessionSendInput) {
	const run = await ctx.newTx((tx) => getRun(tx, input.runId));
	assertSendTarget(run, input);
	if (run.projectId) assertProjectActive(ctx.core, run.projectId);
	const files = await prepareFiles(ctx, input.files);
	const text = await attachmentPrompt(ctx.home, run.id, input.text, files);
	return prepareSend(ctx, {
		id: run.id,
		text,
		expectedTerminalId: input.expectedTerminalId,
		messageId: input.messageId,
	});
}
