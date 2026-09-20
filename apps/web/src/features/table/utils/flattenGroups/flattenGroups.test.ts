import { describe, expect, test } from "bun:test";
import type { TicketPr, TicketSummary } from "@trellis/api";
import { flattenGroups, type TableGroup } from "./flattenGroups";

const pr = (number: number) => ({ number, owner: "0x962", repo: "trellis" }) as TicketPr;

const ticket = (id: string, prRows: TicketPr[] = []) => ({ id, prRows }) as TicketSummary;

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
});
