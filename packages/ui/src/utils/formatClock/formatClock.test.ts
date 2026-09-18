import { expect, test } from "bun:test";
import { formatClock } from "./formatClock";

test("reads minutes and seconds under an hour", () => {
	expect(formatClock(0)).toBe("0:00");
	expect(formatClock(7_400)).toBe("0:07");
	expect(formatClock(105_000)).toBe("1:45");
	expect(formatClock(3_599_999)).toBe("59:59");
});

test("adds the hour past sixty minutes", () => {
	expect(formatClock(3_600_000)).toBe("1:00:00");
	expect(formatClock(3_729_000)).toBe("1:02:09");
});

test("never reads below zero", () => {
	expect(formatClock(-5_000)).toBe("0:00");
});
