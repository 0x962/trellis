import { describe, expect, test } from "bun:test";
import { compactRelativeTime, formatCount } from "./format";

const now = new Date("2026-09-09T12:00:00.000Z");
const minute = 60 * 1000;
const hour = 60 * minute;

const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe("format", () => {
	// MI-57. The approved canvas shows 2h, 5h, 1d, and 9m on the rows.
	test("compactRelativeTime prints the canvas time strings", () => {
		expect(compactRelativeTime(ago(2 * hour), now)).toBe("2h");
		expect(compactRelativeTime(ago(5 * hour), now)).toBe("5h");
		expect(compactRelativeTime(ago(24 * hour), now)).toBe("1d");
		expect(compactRelativeTime(ago(9 * minute), now)).toBe("9m");
	});

	// MI-58
	test("formatCount groups the digits", () => {
		expect(formatCount(1234)).toBe(new Intl.NumberFormat().format(1234));
		expect(formatCount(1234)).toMatch(/^1\D234$/);
		expect(formatCount(6)).toBe("6");
	});
});
