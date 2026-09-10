import { describe, expect, test } from "bun:test";
import type { Inbox, InboxSection, TicketSummary } from "@trellis/api";
import { ticketSummary } from "../../../../../test/fixtures";
import { badgeCount, inboxRows, isInboxEmpty, type OpenSections } from "./inboxRows";

const rows = (count: number, prefix: string) =>
	Array.from({ length: count }, (_, index) =>
		ticketSummary({ id: `${prefix}${String(index).padStart(2, "0")}`, identifier: `${prefix}-${index + 1}` }),
	) as TicketSummary[];

// A section whose `total` may exceed its rows, as the 100-row cap does.
const section = (items: TicketSummary[], total = items.length): InboxSection => ({ items, total });

const inbox = (totals: [number, number, number, number]): Inbox => ({
	review: section(rows(Math.min(totals[0], 100), "R"), totals[0]),
	failingCi: section(rows(totals[1], "F")),
	stalled: section(rows(totals[2], "S")),
	doneByAgentsToday: section(rows(totals[3], "D")),
});

const open: OpenSections = { review: true, failingCi: true, stalled: true, doneByAgentsToday: false };

describe("inboxRows", () => {
	// MI-17. The approved pill shows 4 for the seeded inbox.
	test("the badge count adds review and failing CI only", () => {
		expect(badgeCount(inbox([3, 1, 1, 6]))).toBe(4);
		expect(badgeCount(inbox([0, 0, 2, 6]))).toBe(0);
	});

	// MI-21
	test("inboxRows flattens the sections into typed FlashList items", () => {
		const items = inboxRows(inbox([3, 1, 1, 6]), open);
		expect(items.map((item) => item.type)).toEqual([
			"header",
			"row",
			"row",
			"row",
			"header",
			"row",
			"header",
			"row",
			"header",
		]);
		expect(items.map((item) => item.key)).toEqual([
			"review",
			"review",
			"review",
			"review",
			"failingCi",
			"failingCi",
			"stalled",
			"stalled",
			"doneByAgentsToday",
		]);
		const ids = items.flatMap((item) => (item.type === "row" ? [item.ticket.identifier] : []));
		expect(ids).toEqual(["R-1", "R-2", "R-3", "F-1", "S-1"]);
		for (const item of items) expect(["header", "row"]).toContain(item.type);

		const expanded = inboxRows(inbox([3, 1, 1, 6]), { ...open, doneByAgentsToday: true });
		expect(expanded.filter((item) => item.type === "row" && item.key === "doneByAgentsToday")).toHaveLength(6);

		const capped = inboxRows(inbox([140, 0, 0, 0]), open);
		const header = capped[0];
		if (header?.type !== "header") throw new Error("expected a header first");
		expect(header.total).toBe(140);
		expect(capped.filter((item) => item.type === "row" && item.key === "review")).toHaveLength(100);
	});

	// MI-22
	test("an inbox is empty only when every section total is zero", () => {
		expect(isInboxEmpty(inbox([0, 0, 0, 0]))).toBe(true);
		expect(isInboxEmpty(inbox([1, 0, 0, 0]))).toBe(false);
		expect(isInboxEmpty(inbox([0, 1, 0, 0]))).toBe(false);
		expect(isInboxEmpty(inbox([0, 0, 1, 0]))).toBe(false);
		expect(isInboxEmpty(inbox([0, 0, 0, 1]))).toBe(false);
	});
});
