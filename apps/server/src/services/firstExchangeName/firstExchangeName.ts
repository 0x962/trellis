import type { Session } from "@trellis/api";
import type { Tx } from "../../db/tx.ts";
import { type RequestedSessionName, type RequestSessionNameInput, requestSessionName } from "../agentRuns.ts";
import { checkGeneratedName, claimTemporaryName, saveRequestedName } from "../sessions";
import type { IoCtx } from "../support.ts";

type RequestSessionNameFn = (ctx: IoCtx, input: RequestSessionNameInput) => Promise<RequestedSessionName>;

type PreparedSessionName = { sessionId: string; runId: string; name: string } | null;

export async function prepareNameFromFirstExchange(
	ctx: IoCtx,
	input: { sessionId: string; agentResponse: string },
	requestName: RequestSessionNameFn = requestSessionName,
): Promise<PreparedSessionName> {
	const claimed = await ctx.newTx((tx) => claimTemporaryName(ctx.core, tx, { sessionId: input.sessionId }));
	if (claimed === null) return null;
	const fields = { session: input.sessionId, run: claimed.runId };
	ctx.log("session name claimed", fields);
	const requested = await requestName(ctx, { runId: claimed.runId, agentResponse: input.agentResponse });
	ctx.log("session name result", fields);
	const name = checkGeneratedName(requested.initialPrompt, requested.candidateName, requested.protectedTerms);
	return { sessionId: input.sessionId, runId: claimed.runId, name };
}

export async function saveNameFromFirstExchange(
	ctx: IoCtx,
	tx: Tx,
	input: PreparedSessionName,
): Promise<Session | null> {
	if (input === null) return null;
	const fields = { session: input.sessionId, run: input.runId };
	const saved = await saveRequestedName(ctx.core, tx, { id: input.sessionId, name: input.name });
	ctx.log("session name renamed", { ...fields, saved: saved !== null });
	return saved;
}
