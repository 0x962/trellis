import { nativeClient } from "../../agents/native/connection.ts";
import { claudePermissionResponse } from "../../agents/nativeHarness/claudePermissionResponse.ts";
import type { HarnessSnapshot } from "../../agents/nativeHarness/types.ts";
import { invalidInput } from "../../errors.ts";
import type { ServiceCtx } from "../support.ts";
import { getRun } from "./queries.ts";
import { readNativeHarness } from "./readNativeHarness.ts";

export const harness = async (ctx: ServiceCtx, input: { id: string }): Promise<HarnessSnapshot | null> => {
	const run = await ctx.newTx((tx) => getRun(tx, input.id));
	return readNativeHarness(ctx, run);
};

export const permission = async (
	ctx: ServiceCtx,
	input: { id: string; requestId: string; behavior: "allow" | "deny" },
) => {
	if (ctx.actor.kind !== "human") throw invalidInput("actor", "A person must decide each tool permission request.");
	const run = await ctx.newTx((tx) => getRun(tx, input.id));
	const snapshot = await harness(ctx, input);
	const pending = snapshot?.pendingPermissions.find((request) => request.requestId === input.requestId);
	if (!pending || run.state !== "running")
		throw invalidInput("requestId", "This tool permission request is not pending.");
	const decision =
		input.behavior === "allow"
			? { behavior: "allow" as const, updatedInput: pending.input }
			: { behavior: "deny" as const, message: "The person denied this tool request." };
	const delivered = await nativeClient(ctx.home).deliver(
		run.terminalId!,
		`permission-${input.requestId}`,
		claudePermissionResponse(input.requestId, decision),
	);
	if (delivered.status === "unknown")
		throw invalidInput("requestId", "The permission response is uncertain. Inspect the agent before another response.");
	ctx.emit({ type: "agent-runs.changed", id: run.id });
	return {};
};
