import { expect, test } from "bun:test";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { pauseRestartFixture } from "../agentRuns/pauseRestartFixture";
import { SESSION_OBSERVER_MODEL } from "./types.ts";
import { waitForObserverReply } from "./waitForObserverReply.ts";

const complete = () => ({
	...pauseRestartFixture("attempt", new Date()),
	status: "running" as const,
	controllable: true,
	agent: {
		sessionId: "observer-conversation",
		model: SESSION_OBSERVER_MODEL,
		turnId: "turn",
		tool: null,
		lastTool: null,
		lastMessage: null,
		error: null,
		outcome: "completed" as const,
	},
	activity: { state: "idle" as const, updatedAt: new Date().toISOString() },
	acknowledgedMessageIds: ["attempt"],
	result: { id: "result", text: `Complete ${"reply ".repeat(30000)}` },
});
const clientFor = (states: ReturnType<typeof complete>[]) =>
	({
		subscribeSession: async function* () {
			for (const session of states) yield { type: "session" as const, session };
		},
	}) as Pick<RuntimeClient, "subscribeSession">;
const input = () => ({
	attemptId: "attempt",
	providerSessionId: "observer-conversation",
	signal: new AbortController().signal,
});

test("requires the observer receipt and returns the full completed result", async () => {
	const state = complete();
	expect((await waitForObserverReply(clientFor([state]), input())).result).toEqual(state.result);
});

test.each(["conversation", "model", "receipt", "empty", "partial", "interrupted"])(
	"rejects a %s mismatch",
	async (kind) => {
		const state = complete();
		if (kind === "conversation") state.agent.sessionId = "worker-conversation";
		if (kind === "model") state.agent.model = "anthropic/claude-sonnet-5";
		if (kind === "receipt") state.acknowledgedMessageIds = [];
		if (kind === "empty") state.result.text = "";
		if (kind === "partial") state.activity.state = "working" as "idle";
		if (kind === "interrupted") state.agent.outcome = "interrupted" as "completed";
		await expect(waitForObserverReply(clientFor([state]), input())).rejects.toThrow();
	},
);

test("classifies context capacity without returning private provider text", async () => {
	const state = complete();
	Object.assign(state.agent, { outcome: "failed", error: "Prompt is too long: secret input" });
	await expect(waitForObserverReply(clientFor([state]), input())).rejects.toMatchObject({
		code: "OBSERVER_CONTEXT_CAPACITY",
		message: "The observer context exceeds Claude capacity. Summarize the context explicitly before another request.",
	});
});

test("cancels the observation while the model works", async () => {
	const controller = new AbortController();
	const client = {
		subscribeSession: async function* (_id: string, signal: AbortSignal) {
			controller.abort();
			signal.throwIfAborted();
			yield { type: "session" as const, session: complete() };
		},
	} as Pick<RuntimeClient, "subscribeSession">;
	await expect(waitForObserverReply(client, { ...input(), signal: controller.signal })).rejects.toMatchObject({
		name: "AbortError",
	});
});
