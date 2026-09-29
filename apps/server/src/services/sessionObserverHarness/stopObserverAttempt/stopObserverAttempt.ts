import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { ObserverHarnessError } from "../types.ts";

export async function stopObserverAttempt(client: Pick<RuntimeClient, "stop">, attemptId: string): Promise<void> {
	try {
		const stopped = await client.stop(attemptId);
		if (stopped.status === "exited") return;
	} catch {
		throw new ObserverHarnessError(
			"OBSERVER_CANCEL_UNCONFIRMED",
			"The runtime could not confirm that the observer stopped. Restore the runtime before another update.",
		);
	}
	throw new ObserverHarnessError(
		"OBSERVER_CANCEL_UNCONFIRMED",
		"The runtime could not confirm that the observer stopped. Restore the runtime before another update.",
	);
}
