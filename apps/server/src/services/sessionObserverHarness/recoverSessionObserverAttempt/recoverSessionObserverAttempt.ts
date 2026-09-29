import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { nativeClient } from "../../../agents/native/connection.ts";
import type { Tx } from "../../../db/tx.ts";
import { getRun } from "../../agentRuns/queries.ts";
import type { IoCtx } from "../../support.ts";
import { ObserverHarnessError } from "../types.ts";

export async function recoverSessionObserverAttempt(
	ctx: Pick<IoCtx, "home" | "newTx">,
	input: { observerRunId: string },
	deps: {
		read: (tx: Tx, id: string) => Promise<{ terminalId: string | null }>;
		client: (home: string) => Pick<RuntimeClient, "recover" | "stop">;
	} = { read: getRun, client: nativeClient },
): Promise<void> {
	const run = await ctx.newTx((tx) => deps.read(tx, input.observerRunId));
	if (!run.terminalId) return;
	try {
		const client = deps.client(ctx.home);
		const recovered = await client.recover(run.terminalId);
		if (recovered.status === "exited") return;
		const stopped = await client.stop(run.terminalId);
		if (stopped.status === "exited") return;
	} catch {
		throw new ObserverHarnessError(
			"OBSERVER_CANCEL_UNCONFIRMED",
			"The runtime could not confirm that the observer stopped. Restore the runtime before dispatch.",
		);
	}
	throw new ObserverHarnessError(
		"OBSERVER_CANCEL_UNCONFIRMED",
		"The runtime could not confirm that the observer stopped. Restore the runtime before dispatch.",
	);
}
