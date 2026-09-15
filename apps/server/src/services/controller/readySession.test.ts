import { expect, test } from "bun:test";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { readySession } from "./readySession.ts";

test("controller readiness requires the current attempt's initial prompt receipt", () => {
	const session = {
		id: "attempt",
		status: "running",
		mode: "pty",
		controllable: true,
		activity: { state: "ready", updatedAt: "now" },
		acknowledgedMessageIds: [],
	} as unknown as RuntimeProcessStatus;
	expect(readySession(session)).toBe(false);
	expect(readySession({ ...session, acknowledgedMessageIds: ["previous-attempt"] })).toBe(false);
	expect(readySession({ ...session, acknowledgedMessageIds: ["attempt"] })).toBe(true);
});

test("controller dispatch waits after a provider failure", () => {
	const session = {
		id: "attempt",
		status: "running",
		mode: "pty",
		controllable: true,
		activity: { state: "idle", updatedAt: "now" },
		acknowledgedMessageIds: ["attempt"],
		agent: {
			sessionId: "provider",
			model: "model",
			turnId: "turn",
			tool: null,
			error: "Authentication failed",
			outcome: "failed",
		},
	} as unknown as RuntimeProcessStatus;
	expect(readySession(session)).toBe(false);
});
