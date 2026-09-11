import { describe, expect, test } from "bun:test";
import type { Status, TicketSummary } from "@trellis/api";
import { ticketSummary } from "../../../../../test/fixtures";
import { createTestServer } from "../../../../../test/server";
import { groupRows } from "./groupRows";

const server = createTestServer();
const { statuses } = await server.client.statuses.list({ project: "CDE" });

const summaryOf = ({ id, slug, name, category, reviewer, color }: Status) => ({
	id,
	slug,
	name,
	category,
	reviewer,
	color,
});

const status = (slug: string) => summaryOf(statuses.find((entry) => entry.slug === slug)!);

const at = (minutesAgo: number) => new Date(Date.parse("2026-09-09T12:00:00.000Z") - minutesAgo * 60_000).toISOString();

// A row with its own id and number. A larger number gives a larger id, so
// the two orders agree.
const row = (number: number, overrides: Record<string, unknown> = {}): TicketSummary =>
	ticketSummary({
		id: `01J8Z6X4Q3M2K1H0G9F8E7D${String(number).padStart(3, "0")}`,
		identifier: `CDE-${number}`,
		number,
		updatedAt: at(number),
		createdAt: at(number + 100),
		...overrides,
	}) as TicketSummary;

const inStatus = (number: number, slug: string) => row(number, { status: status(slug) });

const numbers = (group: { rows: TicketSummary[] }) => group.rows.map((entry) => entry.number);

const keys = (groups: { key: string }[]) => groups.map((group) => group.key);

// Every ticket lands in exactly one group.
const partitions = (groups: { rows: TicketSummary[] }[], rows: TicketSummary[]) => {
	const seen = groups.flatMap((group) => group.rows.map((entry) => entry.id));
	expect(seen).toHaveLength(rows.length);
	expect(new Set(seen).size).toBe(rows.length);
};

describe("features/table/utils/groupRows", () => {
	// Outcome 9. Human Review moves ahead of Agent Review by position, so the
	// order inside the review category comes from the configured position.
	test("orders status groups by category then by configured position", () => {
		const swapped = statuses.map((entry) =>
			entry.slug === "human-review"
				? { ...entry, position: 2 }
				: entry.slug === "agent-review"
					? { ...entry, position: 3 }
					: entry,
		);
		const rows = [
			inStatus(1, "canceled"),
			inStatus(2, "agent-review"),
			inStatus(3, "done"),
			inStatus(4, "todo"),
			inStatus(5, "human-review"),
			inStatus(6, "in-progress"),
		];
		const groups = groupRows(rows, { group: "status", sort: "-updatedAt", statuses: swapped });
		expect(keys(groups)).toEqual(["todo", "in-progress", "human-review", "agent-review", "done", "canceled"]);
		expect(groups.map(numbers)).toEqual([[4], [6], [5], [2], [3], [1]]);
	});

	// Outcome 10. The default URL sort, `-updatedAt`, is the table's own
	// order: priority first, then the newest update.
	test("sorts rows by priority descending then by updated descending", () => {
		const rows = [
			row(1, { priority: "low", updatedAt: at(5) }),
			row(2, { priority: "urgent", updatedAt: at(50) }),
			row(3, { priority: "none", updatedAt: at(1) }),
			row(4, { priority: "high", updatedAt: at(30) }),
			row(5, { priority: "medium", updatedAt: at(10) }),
			row(6, { priority: "high", updatedAt: at(3) }),
			row(7, { priority: "urgent", updatedAt: at(2) }),
		];
		const [group] = groupRows(rows, { group: "none", sort: "-updatedAt", statuses });
		expect(numbers(group!)).toEqual([7, 2, 6, 4, 5, 1, 3]);
	});

	// Outcome 11
	test("breaks a sort tie by id descending and stays stable", () => {
		const rows = [row(8, { priority: "high", updatedAt: at(4) }), row(9, { priority: "high", updatedAt: at(4) })];
		const first = groupRows(rows, { group: "none", sort: "-updatedAt", statuses });
		const second = groupRows([...rows].reverse(), { group: "none", sort: "-updatedAt", statuses });
		expect(numbers(first[0]!)).toEqual([9, 8]);
		expect(numbers(second[0]!)).toEqual([9, 8]);
	});

	// Outcome 12
	test("groups by priority, project, parent, and PR state", () => {
		const project = (path: string) => ({ id: `01J8Z6X4Q3M2K1H0G9F8E7D6P${path.length}`, key: "CDE", path });
		const parent = (identifier: string) => ({ id: `01J8Z6X4Q3M2K1H0G9F8E7DP${identifier.slice(-2)}`, identifier });
		const pr = (state: string) => ({ state, ciState: "pass", pass: 1, fail: 0, pending: 0 });
		const rows = [
			row(1, { priority: "low", project: project("CDE.web.auth"), parent: parent("CDE-43"), pr: null }),
			row(2, { priority: "none", project: project("CDE"), parent: null, pr: pr("closed") }),
			row(3, { priority: "urgent", project: project("CDE.web"), parent: parent("CDE-12"), pr: pr("merged") }),
			row(4, { priority: "medium", project: project("CDE.web"), parent: parent("CDE-43"), pr: pr("open") }),
			row(5, { priority: "high", project: project("CDE"), parent: null, pr: pr("open") }),
		];
		const byPriority = groupRows(rows, { group: "priority", sort: "-updatedAt", statuses });
		expect(keys(byPriority)).toEqual(["urgent", "high", "medium", "low", "none"]);
		expect(byPriority.map(numbers)).toEqual([[3], [5], [4], [1], [2]]);
		partitions(byPriority, rows);

		const byProject = groupRows(rows, { group: "project", sort: "-updatedAt", statuses, project: "CDE" });
		expect(keys(byProject)).toEqual(["CDE", "CDE.web", "CDE.web.auth"]);
		expect(byProject.map(numbers)).toEqual([[5, 2], [3, 4], [1]]);
		partitions(byProject, rows);

		const byParent = groupRows(rows, { group: "parent", sort: "-updatedAt", statuses });
		expect(keys(byParent).sort()).toEqual(["CDE-12", "CDE-43", "none"]);
		expect(numbers(byParent.find((group) => group.key === "CDE-43")!)).toEqual([4, 1]);
		expect(numbers(byParent.find((group) => group.key === "none")!)).toEqual([5, 2]);
		partitions(byParent, rows);

		const byPr = groupRows(rows, { group: "pr", sort: "-updatedAt", statuses });
		expect(keys(byPr)).toEqual(["open", "merged", "closed", "none"]);
		expect(byPr.map(numbers)).toEqual([[5, 4], [3], [2], [1]]);
		partitions(byPr, rows);
	});

	// Outcome 13
	test("returns one flat sorted list when grouping is off", () => {
		const rows = [
			inStatus(1, "done"),
			row(2, { priority: "urgent", status: status("todo") }),
			row(3, { priority: "high", status: status("in-progress") }),
			row(4, { priority: "high", status: status("todo"), updatedAt: at(1) }),
		];
		const groups = groupRows(rows, { group: "none", sort: "-updatedAt", statuses });
		expect(groups).toHaveLength(1);
		expect(groups[0]!.label).toBeNull();
		expect(numbers(groups[0]!)).toEqual([2, 4, 3, 1]);
	});

	// Outcome 14. Row 3 is the newest and row 1 the oldest by creation.
	test("follows the URL sort instead of the default order", () => {
		const rows = [
			row(1, { priority: "urgent", createdAt: at(300) }),
			row(2, { priority: "none", createdAt: at(200) }),
			row(3, { priority: "low", createdAt: at(100) }),
		];
		const [group] = groupRows(rows, { group: "none", sort: "-createdAt", statuses });
		expect(numbers(group!)).toEqual([3, 2, 1]);
		const [ascending] = groupRows(rows, { group: "none", sort: "createdAt", statuses });
		expect(numbers(ascending!)).toEqual([1, 2, 3]);
	});
});
