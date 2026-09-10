import { describe, expect, test } from "bun:test";
import type { Inbox } from "@trellis/api";
import { needsYouCount } from "./needsYouCount";

// Only the totals matter here, so every section carries an empty item list.
const inbox = (review: number, failingCi: number, stalled: number, doneByAgentsToday: number): Inbox => ({
	review: { items: [], total: review },
	failingCi: { items: [], total: failingCi },
	stalled: { items: [], total: stalled },
	doneByAgentsToday: { items: [], total: doneByAgentsToday },
});

describe("needsYouCount", () => {
	// NY-49. The badge counts every section, so a row a person can act on is
	// never hidden from the count.
	test("sums every section total", () => {
		expect(needsYouCount(inbox(3, 1, 1, 6))).toBe(11);
	});

	// NY-50
	test("returns zero for an empty inbox", () => {
		expect(needsYouCount(inbox(0, 0, 0, 0))).toBe(0);
	});
});
