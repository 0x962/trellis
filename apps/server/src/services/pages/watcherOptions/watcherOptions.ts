import { PageWatcherOptionsInputSchema } from "@trellis/api";
import type { ServiceCtx } from "../../../context.ts";
import type { Tx } from "../../../db/tx.ts";
import { watchableAgents } from "../../agentRuns.ts";
import { resolvePage } from "../pages.ts";

export async function watcherOptions(ctx: ServiceCtx, tx: Tx, rawInput: unknown) {
	const input = PageWatcherOptionsInputSchema.parse(rawInput);
	const page = await resolvePage(ctx, tx, input.page);
	return watchableAgents(ctx, tx, { projectId: page.project_id });
}
