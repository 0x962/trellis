import { expect, test } from "bun:test";
import type { RuntimeListInput, RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { observeRuns } from "./liveState.ts";
import type { StoredRun } from "./queries.ts";

const storedRun = (id: string, terminalId: string | null): StoredRun => ({
	id,
	accountId: null,
	name: "Worker",
	runtime: "native",
	personaId: null,
	personaName: "Builder",
	kind: "builder",
	instruction: "Work",
	projectId: null,
	projectPath: "TRL",
	ticketId: null,
	ticketIdentifier: null,
	closedAt: null,
	workspaceId: null,
	terminalId,
	url: null,
	error: null,
	sessionId: null,
	sessionLost: false,
	createdAt: "2026-09-16T00:00:00.000Z",
	updatedAt: "2026-09-16T00:00:00.000Z",
});

test("observes only the runtime sessions used by the selected runs", async () => {
	let input: RuntimeListInput | undefined;
	const read = async (_home: string, requested: RuntimeListInput): Promise<RuntimeProcessStatus[]> => {
		input = requested;
		return [];
	};
	await observeRuns(
		{ home: "/unused" },
		[storedRun("one", "attempt-one"), storedRun("two", "attempt-one"), storedRun("three", null)],
		read,
	);
	expect(input).toEqual({ ids: ["attempt-one"] });
});

test("skips the runtime request when no selected run has a terminal", async () => {
	let calls = 0;
	const read = async (): Promise<RuntimeProcessStatus[]> => {
		calls += 1;
		return [];
	};
	const result = await observeRuns({ home: "/unused" }, [storedRun("historical", null)], read);
	expect(calls).toBe(0);
	expect(result).toHaveLength(1);
});
