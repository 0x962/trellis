import { invalidInput } from "../../errors.ts";
import type { ServiceCtx } from "../support.ts";
import { refreshNative, stopNative } from "./nativeLifecycle.ts";
import { getRun } from "./queries.ts";

export const prepareStop = async (ctx: ServiceCtx, input: { id: string }) => {
	const run = await ctx.newTx((tx) => getRun(tx, input.id));
	if (run.runtime !== "native") throw invalidInput("id", "This historical assignment has no local process to stop.");
	return stopNative(ctx, run);
};

export const prepareRefresh = async (ctx: ServiceCtx, input: { id: string }) => {
	const run = await ctx.newTx((tx) => getRun(tx, input.id));
	if (run.runtime !== "native") return input;
	return refreshNative(ctx, run);
};
