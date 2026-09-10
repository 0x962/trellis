import { describe, expect, test } from "bun:test";
import { formatBytes } from "./formatBytes";

describe("formatBytes", () => {
	// OUT-34. A row states the size in the unit a reader thinks in, so a
	// screenshot reads 180.0 KB and never 184320 B.
	test("formats bytes, kilobytes, and megabytes to one decimal", () => {
		expect(formatBytes(512)).toBe("512 B");
		expect(formatBytes(2048)).toBe("2.0 KB");
		expect(formatBytes(184_320)).toBe("180.0 KB");
		expect(formatBytes(5_242_880)).toBe("5.0 MB");
	});
});
