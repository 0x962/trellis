import { describe, expect, test } from "bun:test";
import { compactRelativeTime } from "./time";

const now = Date.parse("2026-09-09T12:00:00.000Z");
const at = (ms: number) => new Date(now - ms).toISOString();

describe("compactRelativeTime", () => {
	test("buckets by seconds, minutes, hours, and days", () => {
		expect(compactRelativeTime(at(3_000), now)).toBe("now");
		expect(compactRelativeTime(at(12_000), now)).toBe("12s");
		expect(compactRelativeTime(at(5 * 60_000), now)).toBe("5m");
		expect(compactRelativeTime(at(3 * 3_600_000), now)).toBe("3h");
		expect(compactRelativeTime(at(47 * 3_600_000), now)).toBe("1d");
	});
});
