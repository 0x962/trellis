import { expect, test } from "bun:test";
import type { AgentRun } from "@trellis/api";
import { sessionGroups } from "./sessionGroups";

type Run = Pick<AgentRun, "assigned" | "ticketStatusCategory"> & { id: string };

test("sessionGroups archives closed assignments and tickets", () => {
	const runs: Run[] = [
		{ id: "working", assigned: true, ticketStatusCategory: "started" },
		{ id: "session", assigned: true, ticketStatusCategory: null },
		{ id: "replaced", assigned: false, ticketStatusCategory: "started" },
		{ id: "done", assigned: true, ticketStatusCategory: "done" },
		{ id: "canceled", assigned: true, ticketStatusCategory: "canceled" },
	];

	expect(sessionGroups(runs)).toEqual({
		current: runs.slice(0, 2),
		archived: runs.slice(2),
	});
});
