import { describe, expect, test } from "bun:test";
import type { Check } from "./segments";
import { ribbonGap, ribbonSegments } from "./segments";

const checks = (count: number, bucket: Check["bucket"]): Check[] =>
	Array.from({ length: count }, (_, index) => ({ name: `Check ${index + 1}`, bucket }));

describe("ribbonSegments", () => {
	test("keeps divisions in a crowded all-passing ribbon", () => {
		const segments = ribbonSegments("wide", checks(166, "pass"));

		expect(segments).toHaveLength(96);
		expect(ribbonGap("wide", segments.length)).toBe(1);
		expect(segments.every((segment) => segment.bucket === "pass" && segment.width >= 1)).toBe(true);
	});

	test("uses the worst outcome as the color of a grouped segment", () => {
		const crowded = checks(166, "pass");
		crowded[80] = { name: "Lint", bucket: "fail" };

		const segments = ribbonSegments("wide", crowded);

		expect(segments.filter((segment) => segment.bucket === "fail")).toHaveLength(1);
	});
});
