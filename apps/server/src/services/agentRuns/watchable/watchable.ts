import type { ServiceCtx } from "../../../context.ts";
import type { Tx } from "../../../db/tx.ts";
import { watchableAgents } from "./watchableAgents";

export async function watchableAgent(ctx: ServiceCtx, tx: Tx, input: { projectId: string; id: string }) {
	const { items } = await watchableAgents(ctx, tx, input);
	const [agent] = items;
	return agent ?? null;
}
