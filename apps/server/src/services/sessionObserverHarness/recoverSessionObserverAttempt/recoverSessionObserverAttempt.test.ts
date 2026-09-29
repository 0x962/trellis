import { expect, test } from "bun:test";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { pauseRestartFixture } from "../../agentRuns/pauseRestartFixture";
import type { IoCtx } from "../../support.ts";
import { recoverSessionObserverAttempt } from "./index.ts";

const ctx = { home: "/unused", newTx: async (fn: (tx: unknown) => unknown) => fn({}) } as Pick<IoCtx, "home" | "newTx">;

test.each(["no-attempt", "exited", "running", "unknown", "unconfirmed", "offline"])(
	"recovers %s without a new launch",
	async (scenario) => {
		const calls: string[] = [];
		const deps = {
			read: async () => ({ terminalId: scenario === "no-attempt" ? null : "exact-attempt" }),
			client: () =>
				({
					recover: async (id: string) => {
						calls.push(`recover:${id}`);
						if (scenario === "offline") throw new Error("private runtime details");
						return {
							...pauseRestartFixture(id, new Date()),
							status: scenario === "exited" ? "exited" : scenario === "unknown" ? "unknown" : "running",
						};
					},
					stop: async (id: string) => {
						calls.push(`stop:${id}`);
						return {
							...pauseRestartFixture(id, new Date()),
							status: scenario === "unconfirmed" ? "unknown" : "exited",
						};
					},
				}) as Pick<RuntimeClient, "recover" | "stop">,
		};
		const result = recoverSessionObserverAttempt(ctx, { observerRunId: "observer" }, deps);
		if (scenario === "unconfirmed" || scenario === "offline") {
			await expect(result).rejects.toMatchObject({ code: "OBSERVER_CANCEL_UNCONFIRMED" });
		} else await result;
		expect(calls).toEqual(
			scenario === "no-attempt"
				? []
				: scenario === "exited" || scenario === "offline"
					? ["recover:exact-attempt"]
					: ["recover:exact-attempt", "stop:exact-attempt"],
		);
	},
);
