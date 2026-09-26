import type { ServiceCtx } from "../../../context.ts";
import type { Tx } from "../../../db/tx.ts";
import { invalidInput } from "../../../errors.ts";
import { watchableAgent } from "./watchable";

export async function assertWatchable(ctx: ServiceCtx, tx: Tx, input: { projectId: string; id: string }) {
	const agent = await watchableAgent(ctx, tx, input);
	if (agent === null) throw invalidInput("agentId", "Choose an assigned agent in this project.");
	return agent;
}
