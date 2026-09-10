import { describe, expect, test } from "bun:test";
import type { Inbox, TicketSummary } from "@trellis/api";
import { ticketSummary } from "../../../../../test/fixtures";
import { needsYouCount } from "./needsYouCount";

const row = (identifier: string) => ticketSummary({ id: `id-${identifier}`, identifier }) as TicketSummary;

// A section whose `total` is the number of rows it carries, unless the test
// names a larger total for a paged section.
const section = (identifiers: string[], total = identifiers.length) => ({ items: identifiers.map(row), total });

const inbox = (parts: Partial<Record<keyof Inbox, ReturnType<typeof section>>>): Inbox => ({
	review: section([]),
	failingCi: section([]),
	stalled: section([]),
	doneByAgentsToday: section([]),
	...parts,
});

describe("needsYouCount", () => {
	// D13. Only Review and Failing checks ask a person to act, so Stalled and
	// Done by agents today do not count.
	test("counts the Review and Failing checks sections only", () => {
		const count = needsYouCount(
			inbox({
				review: section(["CDE-1", "CDE-2", "CDE-3"]),
				failingCi: section(["CDE-4"]),
				stalled: section(["CDE-5"]),
				doneByAgentsToday: section(["CDE-6", "CDE-7"]),
			}),
		);
		expect(count).toBe(4);
	});

	// A ticket in review with failed checks is in both sections. It counts once.
	test("counts a ticket that is in both sections once", () => {
		const count = needsYouCount(
			inbox({ review: section(["CDE-1", "CDE-5"]), failingCi: section(["CDE-5", "CDE-9"]) }),
		);
		expect(count).toBe(3);
	});

	// A section holds at most 100 rows, so the totals carry the count and the
	// loaded rows give the overlap.
	test("counts from the totals of a paged section and subtracts the loaded overlap", () => {
		const count = needsYouCount(inbox({ review: section(["CDE-1", "CDE-5"], 150), failingCi: section(["CDE-5"], 2) }));
		expect(count).toBe(151);
	});

	// NY-50
	test("returns zero for an empty inbox", () => {
		expect(needsYouCount(inbox({}))).toBe(0);
	});
});
