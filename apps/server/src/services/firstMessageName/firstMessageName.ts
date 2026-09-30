import { type RequestedSessionName, type RequestSessionNameInput, requestSessionName } from "../agentRuns.ts";
import { checkGeneratedName, claimTemporaryName } from "../sessions";
import type { IoCtx } from "../support.ts";

type RequestSessionNameFn = (ctx: IoCtx, input: RequestSessionNameInput) => Promise<RequestedSessionName>;

export type PreparedSessionName = { sessionId: string; runId: string; name: string } | null;

export async function prepareNameFromFirstMessage(
	ctx: IoCtx,
	input: { sessionId: string },
	requestName: RequestSessionNameFn = requestSessionName,
): Promise<PreparedSessionName> {
	const claimed = await ctx.newTx((tx) => claimTemporaryName(ctx.core, tx, { sessionId: input.sessionId }));
	if (claimed === null) return null;
	const fields = { session: input.sessionId, run: claimed.runId };
	ctx.log("session name claimed", fields);
	const requested = await requestName(ctx, { runId: claimed.runId });
	ctx.log("session name result", fields);
	const name = checkGeneratedName(requested.initialPrompt, requested.candidateName, requested.protectedTerms);
	return { sessionId: input.sessionId, runId: claimed.runId, name };
}
