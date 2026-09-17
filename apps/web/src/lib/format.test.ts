import { describe, expect, test } from "bun:test";
import { compactRelativeTime, formatCount, relativeTime, tabularClass } from "./format";

const now = new Date("2026-09-09T12:00:00.000Z");

const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

const second = 1000;
const minute = 60 * second;
const hour = 60 * minute;
const day = 24 * hour;

describe("lib/format", () => {
	// WS-32. Under 10 s is "just now"; then seconds, minutes, hours, and days
	// up to 30 days; older stamps show the short date.
	test("relativeTime and compactRelativeTime format every bucket", () => {
		const cases: Array<[string, string, string]> = [
			[ago(3 * second), "just now", "now"],
			[ago(12 * second), "12s ago", "12s"],
			[ago(5 * minute), "5m ago", "5m"],
			[ago(3 * hour), "3h ago", "3h"],
			[ago(3 * day), "3d ago", "3d"],
			[ago(40 * day), "Jul 31", "Jul 31"],
		];
		for (const [iso, long, short] of cases) {
			expect(relativeTime(iso, now), iso).toBe(long);
			expect(compactRelativeTime(iso, now), iso).toBe(short);
		}
	});

	// WS-33. Counts group digits in the browser locale, and every count
	// sits in the `tabular` utility from fonts.css so columns line up.
	test("formatCount groups digits and names the tabular utility", () => {
		expect(formatCount(1234)).toBe(new Intl.NumberFormat().format(1234));
		expect(formatCount(1234)).toBe("1,234");
		expect(formatCount(0)).toBe("0");
		expect(tabularClass).toBe("tabular");
	});
});
