import { expect, test } from "bun:test";
import type { RuntimeSession } from "@trellis/runtime-protocol";
import type { NativeHandleV1 } from "../../langflowContracts";
import { stopAttempt } from "./stopAttempt";
import { stopObligation } from "./stopObligation";

const handle: NativeHandleV1 = {
	version: 1,
	stepId: "step-1",
	agentRunId: "run-1",
	attemptId: "00000000-0000-4000-8000-000000000001",
	workspaceId: null,
	providerSessionId: null,
	state: "launching",
	revision: 1,
};
const now = new Date("2026-09-29T06:02:00.000Z");
const makeStop = () => stopObligation({ executionId: "execution-1", handle, reason: "canceled", now });
const exited: RuntimeSession = {
	id: handle.attemptId,
	daemonId: "runtime-1",
	pid: null,
	mode: "pty",
	status: "exited",
	startedAt: "2026-09-29T06:01:00.000Z",
	endedAt: now.toISOString(),
	exitCode: 0,
	error: null,
};

test("a stop targets the stored attempt even when the assignment has another attempt", async () => {
	const calls: string[] = [];
	const result = await stopAttempt(
		{
			stop: async (id) => {
				calls.push(id);
				return exited;
			},
		},
		makeStop(),
		() => now,
	);
	expect(calls).toEqual([handle.attemptId]);
	expect(result.obligation.state).toBe("confirmed");
	expect(result.obligation.exitReceipt?.attemptId).toBe(handle.attemptId);
	expect(result.error).toBeNull();
});

test("a failed stop retains the obligation and its error", async () => {
	const saved = makeStop();
	const result = await stopAttempt(
		{
			stop: async () => {
				throw new Error("runtime unavailable");
			},
		},
		saved,
	);
	expect(result.obligation).toEqual({ ...saved, state: "ownership_unknown", revision: 2 });
	expect(result.error).toBe("runtime unavailable");
});

for (const response of [
	{ ...exited, id: "00000000-0000-4000-8000-000000000002" },
	{ ...exited, status: "running" as const },
	{ ...exited, status: "unknown" as const },
	{ ...exited, endedAt: null },
]) {
	test(`exit proof rejects ${response.id}/${response.status}/${response.endedAt}`, async () => {
		const result = await stopAttempt({ stop: async () => response }, makeStop());
		expect(result.obligation.state).toBe("ownership_unknown");
		expect(result.obligation.exitReceipt).toBeNull();
	});
}

test("a stop before process launch remains due until the exact attempt exits", async () => {
	const before = await stopAttempt(
		{
			stop: async () => {
				throw new Error("attempt not found");
			},
		},
		makeStop(),
	);
	const restored = JSON.parse(JSON.stringify(before.obligation));
	const after = await stopAttempt({ stop: async () => exited }, restored, () => now);
	expect(after.obligation.obligationId).toBe(before.obligation.obligationId);
	expect(after.obligation.state).toBe("confirmed");
	expect(after.obligation.revision).toBe(3);
});

test("a confirmed stop performs no further runtime call", async () => {
	const confirmed = await stopAttempt({ stop: async () => exited }, makeStop(), () => now);
	const replay = await stopAttempt(
		{
			stop: async () => {
				throw new Error("unexpected call");
			},
		},
		confirmed.obligation,
	);
	expect(replay).toEqual(confirmed);
});
