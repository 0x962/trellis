import { describe, expect, test } from "bun:test";
import { formatBytes, formatUptime } from "./formatSystemUsage";

describe("system usage formats", () => {
	test("formats zero bytes", () => {
		expect(formatBytes(0)).toBe("0 B");
	});

	test("formats byte and time ranges", () => {
		expect(formatBytes(1_572_864)).toBe("1.5 MB");
		expect(formatUptime(90_000)).toBe("1d 1h");
	});
});
