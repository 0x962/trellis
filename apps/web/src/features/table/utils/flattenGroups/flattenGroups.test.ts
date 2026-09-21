import { describe, expect, test } from "bun:test";
import type { TicketPr, TicketSummary } from "@trellis/api";
import type { TicketAgentLine } from "../agentLines";
import { flattenGroups, phoneItems, type TableGroup } from "./flattenGroups";

const pr = (number: number) => ({ number, owner: "0x962", repo: "trellis" }) as TicketPr;

const ticket = (id: string, prRows: TicketPr[] = []) => ({ id, prRows }) as TicketSummary;

const line = (words: string, asks = false): TicketAgentLine => ({ words, asks });

const group = (key: string, expanded: boolean, rows: TicketSummary[]) =>
	({ key, label: key, expanded, count: rows.length, rows }) as TableGroup;

describe("flattenGroups", () => {
	test("leaves the pull requests out when the route does not ask for them", () => {
		const groups = [group("todo", true, [ticket("a", [pr(11)]), ticket("b")])];

		expect(flattenGroups(groups).map((item) => item.kind)).toEqual(["header", "row", "row"]);
	});

	test("puts each pull request of a ticket under that ticket's row", () => {
		const groups = [group("todo", true, [ticket("a", [pr(11), pr(12)]), ticket("b"), ticket("c", [pr(13)])])];

		const items = flattenGroups(groups, { prRows: true });

		expect(items.map((item) => item.kind)).toEqual(["header", "row", "pr", "pr", "row", "row", "pr"]);
		expect(items.flatMap((item) => (item.kind === "pr" ? [item.pr.number] : []))).toEqual([11, 12, 13]);
	});

	test("gives each pull request line a key of its ticket and its pull request", () => {
		const items = flattenGroups([group("todo", true, [ticket("a", [pr(11)])])], { prRows: true });

		expect(items.map((item) => item.key)).toEqual(["header:todo", "a", "pr:a:0x962/trellis#11"]);
	});

	test("two tickets that link one pull request keep two keys", () => {
		const groups = [group("todo", true, [ticket("a", [pr(11)]), ticket("b", [pr(11)])])];

		const keys = flattenGroups(groups, { prRows: true }).flatMap((item) => (item.kind === "pr" ? [item.key] : []));

		expect(new Set(keys).size).toBe(2);
	});

	test("a collapsed group hides its pull requests with its rows", () => {
		const groups = [group("done", false, [ticket("a", [pr(11)])])];

		expect(flattenGroups(groups, { prRows: true }).map((item) => item.kind)).toEqual(["header"]);
	});

	test("the show-more line stays after the last pull request of a group", () => {
		const groups = [{ ...group("todo", true, [ticket("a", [pr(11)])]), hasMore: true } as TableGroup];

		expect(flattenGroups(groups, { prRows: true }).map((item) => item.kind)).toEqual(["header", "row", "pr", "more"]);
	});

	test("puts every pull request before the agent line of its ticket", () => {
		const groups = [group("todo", true, [ticket("a", [pr(11), pr(12)]), ticket("b")])];
		const agentLines = { a: line("crisp-fjord: I rebased.") };

		const items = flattenGroups(groups, { prRows: true, agentLines });

		expect(items.map((item) => item.kind)).toEqual(["header", "row", "pr", "pr", "agent", "row"]);
		expect(items[4]!.key).toBe("agent:a");
	});

	test("gives a ticket with no line no agent line", () => {
		const groups = [group("todo", true, [ticket("a"), ticket("b")])];

		const items = flattenGroups(groups, { agentLines: { b: line("crisp-fjord: I rebased.") } });

		expect(items.map((item) => item.kind)).toEqual(["header", "row", "row", "agent"]);
	});

	test("carries the words and the request mark of the line", () => {
		const agentLines = { a: line("crisp-fjord asks: Which cap?", true) };

		const items = flattenGroups([group("todo", true, [ticket("a")])], { agentLines });

		expect(items.flatMap((item) => (item.kind === "agent" ? [item.line] : []))).toEqual([
			{ words: "crisp-fjord asks: Which cap?", asks: true },
		]);
	});

	test("a collapsed group hides its agent lines with its rows", () => {
		const groups = [group("done", false, [ticket("a")])];
		const agentLines = { a: line("crisp-fjord: I rebased.") };

		expect(flattenGroups(groups, { agentLines }).map((item) => item.kind)).toEqual(["header"]);
	});
});

describe("the agent line on the row", () => {
	const rowLines = (items: ReturnType<typeof flattenGroups>) =>
		items.flatMap((item) => (item.kind === "row" ? [item.agentLine] : []));

	test("gives each row its line, or null when the run says nothing", () => {
		const groups = [group("todo", true, [ticket("a"), ticket("b")])];

		expect(rowLines(flattenGroups(groups, { agentLines: { a: line("Pushed.") } }))).toEqual([line("Pushed."), null]);
	});

	test("gives every row null when the route passes no lines", () => {
		const groups = [group("todo", true, [ticket("a")])];

		expect(rowLines(flattenGroups(groups))).toEqual([null]);
	});
});

describe("phoneItems", () => {
	test("drops the agent lines and the pull request lines, and keeps the rest in order", () => {
		const groups = [{ ...group("todo", true, [ticket("a", [pr(11)]), ticket("b")]), hasMore: true }];
		const items = flattenGroups(groups, { prRows: true, agentLines: { a: line("Pushed.") } });

		expect(phoneItems(items).map((item) => item.kind)).toEqual(["header", "row", "row", "more"]);
	});
});
