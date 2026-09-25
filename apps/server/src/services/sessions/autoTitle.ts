import { SessionGeneratedTitleSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import { getRun } from "../agentRuns/queries.ts";
import { requestSessionTitle, type SessionGeneratedTitleInput } from "../agentRuns/sessionTitleAgent.ts";
import type { IoCtx } from "../support.ts";
import { renameRequested } from "./rename.ts";

type RequestTitle = (ctx: IoCtx, input: SessionGeneratedTitleInput) => Promise<string>;

const forbiddenTitleTerm =
	/\b(?:claude|codex|gpt(?:-[\w.]+)?|gemini|opus|sonnet|haiku|fable|muse|spark|glimmer|llama|mistral)\b|\b[A-Z][A-Z0-9]{1,9}-\d+\b|\b[0-9a-f]{7,40}\b|\b(?:feature|fix|bugfix|hotfix|release|trellis)\/[\w./-]+/gi;

export const generatedSessionTitle = (userMessage: string, response: string, exactTerms: string[] = []) => {
	const title = SessionGeneratedTitleSchema.parse(response.trim());
	for (const match of title.matchAll(forbiddenTitleTerm))
		if (!userMessage.toLowerCase().includes(match[0].toLowerCase()))
			throw new Error(`The session title contains a term that the user did not make the subject: ${match[0]}`);
	for (const term of exactTerms)
		if (
			term !== "" &&
			title.toLowerCase().includes(term.toLowerCase()) &&
			!userMessage.toLowerCase().includes(term.toLowerCase())
		)
			throw new Error(`The session title contains a term that the user did not make the subject: ${term}`);
	return title;
};

export async function nameSessionFromFirstExchange(
	ctx: IoCtx,
	input: { sessionId: string; agentResponse: string },
	requestTitle: RequestTitle = requestSessionTitle,
) {
	const run = await ctx.newTx(async (tx) => {
		const [claimed] = await rows<{ runId: string }>(
			tx,
			sql`UPDATE sessions SET title_state = 'requested'
			WHERE id = ${input.sessionId} AND title_state = 'temporary'
			RETURNING run_id AS "runId"`,
		);
		return claimed === undefined ? null : getRun(tx, claimed.runId);
	});
	if (run === null) return null;
	const response = await requestTitle(ctx, {
		run,
		userMessage: run.instruction,
		agentResponse: input.agentResponse,
	});
	const title = generatedSessionTitle(run.instruction, response, [
		run.name,
		run.ticketIdentifier ?? "",
		run.harness?.model ?? "",
	]);
	return ctx.newTx((tx) => renameRequested(ctx.core, tx, { id: input.sessionId, name: title }));
}
