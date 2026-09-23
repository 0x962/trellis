import { describe, expect, test } from "bun:test";
import { formatBytes } from "./format";

describe("formatBytes", () => {
	test("formats zero bytes", () => {
		expect(formatBytes(0)).toBe("0 B");
	});

	test("formats a byte range", () => {
		expect(formatBytes(1_572_864)).toBe("1.5 MB");
		expect(formatBytes(4_509_715_660)).toBe("4.2 GB");
	});
});
