import { setTimeout } from "node:timers/promises";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { observeClaude } from "./observeClaude.ts";
import type { HarnessSnapshot } from "./types.ts";

export async function waitForClaude(
	client: RuntimeClient,
	attemptId: string,
	sessionId: string,
	predicate: (snapshot: HarnessSnapshot) => boolean,
	options: { initializeId?: string; timeoutMs?: number } = {},
) {
	const deadline = Date.now() + (options.timeoutMs ?? 20_000);
	while (true) {
		const snapshot = await observeClaude(client, attemptId, sessionId, options.initializeId);
		if (predicate(snapshot)) return snapshot;
		if (snapshot.state === "failed") throw new Error(snapshot.error ?? "Claude failed");
		if (Date.now() >= deadline)
			throw new Error(`Claude response remains unknown after the observation deadline (${attemptId})`);
		await setTimeout(100);
	}
}
