import { expect, test } from "bun:test";
import type { AgentSubagentObservation, AgentSubagentPage } from "@trellis/api";
import { SubagentPager } from "./SubagentPager";

const spawn: AgentSubagentObservation = {
	kind: "spawn",
	parentRunId: "run",
	attemptId: "attempt",
	toolCallId: "tool",
	provider: "codex",
	prompt: "Review.",
	providerChildIds: ["child"],
	state: "result-recorded",
	output: null,
	observedAt: "2026-10-10T10:00:00Z",
};
const page = (
	runId: string,
	hasMore: boolean,
	nextCursor: string,
	observations: AgentSubagentObservation[] = [],
): AgentSubagentPage => ({
	runId,
	hasMore,
	nextCursor,
	observations,
	issues: [],
});

test("live refresh reads tail cursors while history requires More", () => {
	const pager = new SubagentPager("PR");
	pager.setIds(["run", "history"]);
	expect(pager.take("initial")).toEqual([{ id: "run" }, { id: "history" }]);
	pager.accept([page("run", false, "tail", [spawn]), page("history", true, "old")]);
	expect(pager.take("initial")).toEqual([]);
	expect(pager.take("tail")).toEqual([{ id: "run", after: "tail" }]);
	pager.accept([
		page("run", false, "new-tail", [
			{
				kind: "status",
				parentRunId: "run",
				attemptId: "attempt",
				observedAt: "2026-10-10T10:01:00Z",
				providerChildId: "child",
				state: "completed",
				output: "Passed.",
			},
		]),
	]);
	expect(pager.records).toMatchObject([{ state: "completed", output: "Passed." }]);
	expect(pager.take("more")).toEqual([{ id: "history", after: "old" }]);
});

test("batches stay bounded and pending reads cannot duplicate a request", () => {
	const pager = new SubagentPager("PR");
	const ids = Array.from({ length: 21 }, (_, index) => String(index));
	pager.setIds(ids);
	expect(pager.take("initial")).toHaveLength(20);
	expect(pager.take("more")).toEqual([]);
	pager.accept(ids.slice(0, 20).map((id) => page(id, false, `tail:${id}`)));
	expect(pager.take("initial")).toEqual([]);
	expect(pager.more).toBe(true);
	expect(pager.take("more")).toEqual([{ id: "20" }]);
});

test("a failed or unavailable refresh preserves records and requires an explicit retry", () => {
	const pager = new SubagentPager("PR");
	pager.setIds(["run"]);
	pager.take("initial");
	pager.accept([page("run", false, "tail", [spawn])]);
	const request = pager.take("tail");
	pager.reject(request);
	expect(pager.take("tail")).toEqual([]);
	expect(pager.records).toHaveLength(1);
	expect(pager.take("more")).toEqual(request);
	pager.accept([{ ...page("run", false, "tail"), issues: [{ attemptId: "attempt", reason: "unavailable" }] }]);
	expect(pager.records).toHaveLength(1);
	expect(pager.partial).toBe(true);
});

test("new runs receive an initial read without a scan of known history", () => {
	const pager = new SubagentPager("PR");
	pager.setIds(["run"]);
	pager.take("initial");
	pager.accept([page("run", true, "history", [spawn])]);
	pager.setIds(["run", "new"]);
	expect(pager.take("initial")).toEqual([{ id: "new" }]);
	pager.accept([page("new", false, "tail")]);
	expect(pager.take("tail")).toEqual([{ id: "new", after: "tail" }]);
});

test("a removed failed run does not block a new run", () => {
	const pager = new SubagentPager("PR");
	pager.setIds(["old"]);
	pager.reject(pager.take("initial"));
	pager.setIds(["new"]);
	expect(pager.hasError).toBe(false);
	expect(pager.take("initial")).toEqual([{ id: "new" }]);
	pager.accept([page("new", false, "tail")]);
	expect(pager.take("tail")).toEqual([{ id: "new", after: "tail" }]);
});
