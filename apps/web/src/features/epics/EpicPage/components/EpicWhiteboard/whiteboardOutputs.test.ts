import { expect, test } from "bun:test";
import type { PullRequest, TicketPr } from "@trellis/api";
import { epic } from "../../../../../stories/pages/fixtures/epic";
import { tickets } from "../../../../../stories/pages/fixtures/project";
import { run } from "../../../../../stories/pages/fixtures/session";
import { whiteboardOutputs } from "./whiteboardOutputs";

test("a shared PR has one node and retains each real source relationship", () => {
	const pr = {
		id: "pr",
		repo: "repo",
		number: 42,
		title: "Change",
		url: "https://github.com/org/repo/pull/42",
		state: "open",
		reviewGaps: [],
		verdict: null,
	} as unknown as TicketPr;
	const parent = { ...tickets[0]!, id: "parent", parent: null, prRows: [pr] };
	const child = { ...tickets[1]!, id: "child", parent: { ...tickets[0]!, id: "parent" }, prRows: [pr] };
	const result = whiteboardOutputs(
		{ ...epic, tickets: [parent, child] },
		[{ ...run, id: "ticket-run", ticketId: "parent" }],
		[{ runId: "bare-run", pullRequest: { ...pr, localState: "ready", localVerdict: null } as unknown as PullRequest }],
	);
	expect(result.outputs.map((output) => output.id)).toEqual(["pr:pr"]);
	expect(result.links.filter((link) => link.to.id === "pr:pr").map((link) => link.from.id)).toEqual([
		"parent",
		"child",
		"bare-run",
	]);
	expect(result.links).toContainEqual({
		from: { kind: "ticket", id: "parent" },
		to: { kind: "ticket", id: "child" },
		label: "Sub-ticket",
	});
	expect(result.links).toContainEqual({
		from: { kind: "ticket", id: "parent" },
		to: { kind: "session", id: "ticket-run" },
		label: "Session",
	});
	expect(result.links.some((link) => link.label === "Subagent")).toBe(false);
});

test("matching names do not create a source relationship", () => {
	const result = whiteboardOutputs(
		{ ...epic, tickets: [{ ...tickets[0]!, prRows: [], parent: null }] },
		[{ ...run, ticketId: "another-epic", name: tickets[0]!.title }],
		[],
	);
	expect(result.outputs).toEqual([]);
	expect(result.links).toEqual([]);
});
