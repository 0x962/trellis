import { SessionGeneratedNameSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../context.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";

const forbiddenNameTerm =
	/\b(?:claude|codex|gpt(?:-[\w.]+)?|gemini|opus|sonnet|haiku|fable|muse|spark|glimmer|llama|mistral)\b|\b[A-Z][A-Z0-9]{1,9}-\d+\b|\b[0-9a-f]{7,40}\b|\b(?:feature|fix|bugfix|hotfix|release|trellis)\/[\w./-]+/gi;

export const checkGeneratedName = (userMessage: string, response: string, exactTerms: string[] = []) => {
	const name = SessionGeneratedNameSchema.parse(response.trim());
	for (const match of name.matchAll(forbiddenNameTerm))
		if (!userMessage.toLowerCase().includes(match[0].toLowerCase()))
			throw new Error(`The session name contains a term that the user did not make the subject: ${match[0]}`);
	for (const term of exactTerms)
		if (
			term !== "" &&
			name.toLowerCase().includes(term.toLowerCase()) &&
			!userMessage.toLowerCase().includes(term.toLowerCase())
		)
			throw new Error(`The session name contains a term that the user did not make the subject: ${term}`);
	return name;
};

export async function claimTemporaryName(_ctx: ServiceCtx, tx: Tx, input: { sessionId: string }) {
	const [claimed] = await rows<{ runId: string }>(
		tx,
		sql`UPDATE sessions SET name_state = 'requested'
		WHERE id = ${input.sessionId} AND name_state = 'temporary'
		RETURNING run_id AS "runId"`,
	);
	return claimed ?? null;
}
