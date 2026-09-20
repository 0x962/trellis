import { describe, expect, test } from "bun:test";
import type { TicketPr, TicketSummary } from "@trellis/api";
import type { AgentLineText } from "../../AgentLine";
import { flattenGroups, type TableGroup } from "./flattenGroups";

const pr = (number: number) => ({ number, owner: "0x962", repo: "trellis" }) as TicketPr;

const ticket = (id: string, prRows: TicketPr[] = []) => ({ id, prRows }) as TicketSummary;

const line = (words: string, asks = false): AgentLineText => ({ words, asks });

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

	test("puts the agent line of a ticket between its row and its pull requests", () => {
		const groups = [group("todo", true, [ticket("a", [pr(11)]), ticket("b")])];
		const agentLines = new Map([["a", line("crisp-fjord: I rebased.")]]);

		const items = flattenGroups(groups, { prRows: true, agentLines });

		expect(items.map((item) => item.kind)).toEqual(["header", "row", "agent", "pr", "row"]);
		expect(items[2]!.key).toBe("agent:a");
	});

	test("gives a ticket with no line no agent line", () => {
		const groups = [group("todo", true, [ticket("a"), ticket("b")])];

		const items = flattenGroups(groups, { agentLines: new Map([["b", line("crisp-fjord: I rebased.")]]) });

		expect(items.map((item) => item.kind)).toEqual(["header", "row", "row", "agent"]);
	});

	test("carries the words and the request mark of the line", () => {
		const agentLines = new Map([["a", line("crisp-fjord asks: Which cap?", true)]]);

		const items = flattenGroups([group("todo", true, [ticket("a")])], { agentLines });

		expect(items.flatMap((item) => (item.kind === "agent" ? [item.line] : []))).toEqual([
			{ words: "crisp-fjord asks: Which cap?", asks: true },
		]);
	});

	test("a collapsed group hides its agent lines with its rows", () => {
		const groups = [group("done", false, [ticket("a")])];
		const agentLines = new Map([["a", line("crisp-fjord: I rebased.")]]);

		expect(flattenGroups(groups, { agentLines }).map((item) => item.kind)).toEqual(["header"]);
	});
});
