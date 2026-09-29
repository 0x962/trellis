import { ORPCError } from "@orpc/server";
import { invalidInput } from "../../../errors.ts";
import { readWorkspaceChanges } from "./readWorkspaceChanges.ts";
import { target } from "./target.ts";
import type { WorkspaceCtx } from "./types.ts";

export const workspace = async (ctx: WorkspaceCtx, input: { runId: string; cursor?: string }) => {
	const selected = await ctx.newTx((tx) => target(tx, input));
	let changes: Awaited<ReturnType<typeof readWorkspaceChanges>>;
	try {
		changes = await readWorkspaceChanges(selected.workspace, input.cursor);
	} catch (error) {
		if (error instanceof ORPCError) throw error;
		throw invalidInput("workspace", (error as Error).message);
	}
	return {
		...changes,
		runId: input.runId,
	};
};
