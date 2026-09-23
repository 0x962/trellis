import { describe, expect, test } from "bun:test";
import { formatUptime } from "./formatSystemUsage";

describe("system usage formats", () => {
	test("formats a time range", () => {
		expect(formatUptime(90_000)).toBe("1d 1h");
	});
});
