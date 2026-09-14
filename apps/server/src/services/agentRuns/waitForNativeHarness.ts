import { setTimeout } from "node:timers/promises";
import type { AgentRun } from "@trellis/api";
import type { HarnessSnapshot } from "../../agents/nativeHarness/types.ts";
import type { ServiceCtx } from "../support.ts";
import { hasNativeReceipt } from "./nativeReceipt.ts";
import { readNativeHarness } from "./readNativeHarness.ts";

export async function waitForNativeHarness(
	ctx: ServiceCtx,
	run: AgentRun,
	predicate: (snapshot: HarnessSnapshot) => boolean,
	options: { messageId?: string; timeoutMs?: number } = {},
) {
	const deadline = Date.now() + (options.timeoutMs ?? 20000);
	while (true) {
		const snapshot = await readNativeHarness(ctx, run);
		if (snapshot !== null) {
			if (options.messageId !== undefined) {
				if (await ctx.newTx((tx) => hasNativeReceipt(tx, run.terminalId!, options.messageId!))) return snapshot;
			} else if (predicate(snapshot)) return snapshot;
			if (snapshot.state === "failed") throw new Error(snapshot.error ?? "Claude failed");
		}
		if (Date.now() >= deadline)
			throw new Error(`Claude response remains unknown after the observation deadline (${run.terminalId})`);
		await setTimeout(100);
	}
}
