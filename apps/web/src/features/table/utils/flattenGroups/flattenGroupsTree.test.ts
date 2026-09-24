import { describe, expect, test } from "bun:test";
import { group, line, pr, prIn, ticket } from "./fixtures";
import { flattenGroups, phoneItems } from "./flattenGroups";

describe("flattenGroups tree", () => {
	// The agent line is always the last child line of its ticket, so only a
	// pull request line carries the flag that ends the rule of the ticket.
	const lastOf = (items: ReturnType<typeof flattenGroups>) =>
		items.flatMap((item) => (item.kind === "pr" ? [item.last] : []));
	const childLinesOf = (items: ReturnType<typeof flattenGroups>) =>
		items.flatMap((item) => (item.kind === "row" ? [item.hasChildLines] : []));

	test("ends the rule of the ticket at its last pull request", () => {
		const groups = [group("todo", true, [ticket("a", [pr(11), pr(12)])])];

		const items = flattenGroups(groups, { prRows: true, agentLines: { a: line("Pushed.") } });

		expect(lastOf(items)).toEqual([false, true]);
	});

	test("hangs the agent line from the merged pull request when that one is last", () => {
		const prs = [prIn(11, "merged"), prIn(12, "open")];

		const items = flattenGroups([group("todo", true, [ticket("a", prs)])], {
			prRows: true,
			agentLines: { a: line("Pushed.") },
		});

		// The open pull request, then the merged one, then the agent line.
		expect(lastOf(items)).toEqual([false, true]);
		expect(items.flatMap((item) => (item.kind === "pr" ? [item.hasChildLines] : []))).toEqual([false, true]);
	});

	test("hangs the agent line from the last pull request of the ticket", () => {
		const groups = [group("todo", true, [ticket("a", [pr(11), pr(12)])])];

		const items = flattenGroups(groups, { prRows: true, agentLines: { a: line("Pushed.") } });

		expect(items.flatMap((item) => (item.kind === "pr" ? [item.hasChildLines] : []))).toEqual([false, true]);
		expect(items.flatMap((item) => (item.kind === "agent" ? [item.depth] : []))).toEqual([2]);
	});

	test("hangs the agent line from the ticket row when the ticket links no pull request", () => {
		const items = flattenGroups([group("todo", true, [ticket("a")])], {
			prRows: true,
			agentLines: { a: line("Pushed.") },
		});

		expect(items.flatMap((item) => (item.kind === "agent" ? [item.depth] : []))).toEqual([1]);
	});

	test("hangs the agent line from the ticket row when the route leaves the pull requests out", () => {
		const items = flattenGroups([group("todo", true, [ticket("a", [pr(11)])])], { agentLines: { a: line("Pushed.") } });

		expect(items.flatMap((item) => (item.kind === "agent" ? [item.depth] : []))).toEqual([1]);
	});

	test("gives a pull request with no agent line under it no child lines", () => {
		const groups = [group("todo", true, [ticket("a", [pr(11), pr(12)])])];

		const items = flattenGroups(groups, { prRows: true });

		expect(items.flatMap((item) => (item.kind === "pr" ? [item.hasChildLines] : []))).toEqual([false, false]);
	});

	test("marks the final pull request as the last child when the ticket has no agent line", () => {
		const groups = [group("todo", true, [ticket("a", [pr(11), pr(12)]), ticket("b", [pr(13)])])];

		expect(lastOf(flattenGroups(groups, { prRows: true }))).toEqual([false, true, true]);
	});

	test("says which ticket rows have child lines under them", () => {
		const groups = [group("todo", true, [ticket("a", [pr(11)]), ticket("b"), ticket("c", [pr(12)], "done")])];

		expect(childLinesOf(flattenGroups(groups, { prRows: true }))).toEqual([true, false, false]);
	});

	test("a ticket has no child lines when the route leaves the pull requests out", () => {
		const groups = [group("todo", true, [ticket("a", [pr(11)])])];

		expect(childLinesOf(flattenGroups(groups))).toEqual([false]);
	});

	test("an opened done ticket has child lines", () => {
		const groups = [group("done", true, [ticket("a", [pr(11)], "done")])];

		expect(childLinesOf(flattenGroups(groups, { prRows: true, expandedTickets: ["a"] }))).toEqual([true]);
	});
});

describe("phoneItems", () => {
	test("drops the agent lines and the pull request lines, and keeps the rest in order", () => {
		const groups = [{ ...group("todo", true, [ticket("a", [pr(11)]), ticket("b")]), hasMore: true }];
		const items = flattenGroups(groups, { prRows: true, agentLines: { a: line("Pushed.") } });

		expect(phoneItems(items).map((item) => item.kind)).toEqual(["header", "row", "row", "more"]);
	});
});
