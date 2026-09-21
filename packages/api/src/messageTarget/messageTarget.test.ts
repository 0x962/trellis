import { expect, test } from "bun:test";
import type { AgentRun } from "../schemas/agentRun.ts";
import { messageTarget } from "./messageTarget.ts";

type Run = Pick<AgentRun, "id" | "kind" | "assigned" | "runtime" | "terminalId" | "processStatus">;

const live: Run = {
	id: "01J00000000000000000000001",
	kind: "agent",
	assigned: true,
	runtime: "native",
	terminalId: "attempt",
	processStatus: "running",
};

test("a message reaches the assigned agent run while its process lives", () => {
	expect(messageTarget([live])).toBe(live);
	expect(messageTarget([{ ...live, processStatus: "unknown" }])).toMatchObject({ processStatus: "unknown" });
});

test("no run takes a message when the process ended, nobody assigned it, or it is no agent run", () => {
	expect(messageTarget([{ ...live, processStatus: "exited" }])).toBeNull();
	expect(messageTarget([{ ...live, terminalId: null }])).toBeNull();
	expect(messageTarget([{ ...live, assigned: false }])).toBeNull();
	expect(messageTarget([{ ...live, kind: "flow" }])).toBeNull();
	expect(messageTarget([])).toBeNull();
});
