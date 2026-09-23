import { expect, test } from "bun:test";
import type { AgentRun } from "@trellis/api";
import { faults } from "./faults.ts";

const run = (fields: Partial<AgentRun>): AgentRun =>
	({
		id: "01K0000000000000000000000A",
		name: "Scout",
		runtime: "native",
		harness: null,
		kind: "agent",
		instruction: "Build it",
		projectId: null,
		projectPath: "TST",
		ticketId: "01K0000000000000000000000B",
		ticketIdentifier: "TST-1",
		ticketTitle: "Build it",
		ticketStatusCategory: "started",
		ticketEpicId: null,
		ticketEpicProjectId: null,
		assigned: true,
		state: "interrupted",
		processStatus: null,
		observation: null,
		workspaceId: null,
		terminalId: null,
		url: null,
		error: null,
		sessionId: null,
		sessionLost: false,
		createdAt: "2026-09-20T12:00:00.000Z",
		updatedAt: "2026-09-20T12:00:00.000Z",
		...fields,
	}) as AgentRun;

test("counts the open assignments with no live process and names the oldest", () => {
	const found = faults(
		[
			run({ createdAt: "2026-09-20T12:00:00.000Z" }),
			run({ createdAt: "2026-09-18T12:00:00.000Z", ticketIdentifier: "TST-2", ticketTitle: "Fix it", state: "failed" }),
			run({ createdAt: "2026-09-17T12:00:00.000Z", state: "running" }),
			run({ createdAt: "2026-09-16T12:00:00.000Z", assigned: false }),
			run({ createdAt: "2026-09-15T12:00:00.000Z", kind: "flow" }),
		],
		[],
		[],
	);

	expect(found).toEqual([
		{
			kind: "agentRunDead",
			count: 2,
			oldest: { identifier: "TST-2", title: "Fix it", since: "2026-09-18T12:00:00.000Z" },
		},
	]);
});

test("sorts every fault by the age of its oldest case", () => {
	const found = faults(
		[run({ createdAt: "2026-09-19T12:00:00.000Z" })],
		[
			{ key: "held", count: 5, identifier: "TST-3", title: "Held", since: "2026-09-20T06:00:00.000Z" },
			{ key: "failed", count: 1, identifier: null, title: null, since: "2026-09-17T06:00:00.000Z" },
		],
		[{ key: "waiting", count: 2, identifier: "TST-4", title: "Waiting", since: "2026-09-18T06:00:00.000Z" }],
	);

	expect(found.map((fault) => fault.kind)).toEqual([
		"reviewMessageFailed",
		"flowRunWaiting",
		"agentRunDead",
		"reviewMessageHeld",
	]);
});

test("holds no fault while every count is zero", () => {
	expect(faults([run({ state: "running" })], [], [])).toEqual([]);
});
