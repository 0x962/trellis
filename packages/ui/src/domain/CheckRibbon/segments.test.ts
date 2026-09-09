import { describe, expect, test } from "bun:test";
import { type Check, ribbonGap, ribbonSegments, ribbonWidths, segmentWidth } from "./segments";

const check = (name: string, bucket: Check["bucket"]) => ({ name, bucket });
const many = (count: number, failAt = -1): Check[] =>
	Array.from({ length: count }, (_, index) => check(`check ${index + 1}`, index === failAt ? "fail" : "pass"));

// happy-dom lays nothing out, so the widths are computed here the way the
// ribbon draws them. The inputs are the box width, the gap, and the count.
const occupied = (size: "full" | "mini", checks: Check[]) => {
	const segments = ribbonSegments(size, checks);
	return (
		segments.reduce((sum, segment) => sum + segment.width, 0) + (segments.length - 1) * ribbonGap(size, checks.length)
	);
};

describe("segments", () => {
	test("the gap shrinks with the count", () => {
		expect(ribbonGap("full", 16)).toBe(2);
		expect(ribbonGap("full", 17)).toBe(1);
		expect(ribbonGap("full", 32)).toBe(1);
		expect(ribbonGap("full", 33)).toBe(0);
		expect(ribbonGap("mini", 16)).toBe(1);
		expect(ribbonGap("mini", 17)).toBe(0);
	});

	test("up to one check per px every check is a segment of at least 1 px", () => {
		expect(segmentWidth("full", 16)).toBe((64 - 15 * 2) / 16);
		expect(segmentWidth("full", 32)).toBe((64 - 31) / 32);
		expect(segmentWidth("full", 64)).toBe(1);
		expect(segmentWidth("mini", 32)).toBe(1);
		for (const size of ["full", "mini"] as const) {
			for (let count = 1; count <= ribbonWidths[size]; count += 1) {
				const segments = ribbonSegments(size, many(count, 0));
				expect(segments).toHaveLength(count);
				expect(segments[0]!.title).toBe("check 1: fail");
				expect(`${size} ${count} ${segments[0]!.width}`).toMatch(/ ([1-9]\d*(\.\d+)?)$/);
				expect(occupied(size, many(count))).toBeCloseTo(ribbonWidths[size], 6);
			}
		}
	});

	test("above one check per px, runs of one bucket are segments that fill the box", () => {
		const segments = ribbonSegments("full", many(80, 39));
		expect(segments.map((segment) => [segment.bucket, segment.title])).toEqual([
			["pass", "39 checks: pass"],
			["fail", "check 40: fail"],
			["pass", "40 checks: pass"],
		]);
		expect(segments[1]!.width).toBe(1);
		expect(segments[0]!.width).toBeCloseTo((39 / 79) * 63, 6);
		expect(segments[2]!.width).toBeCloseTo((40 / 79) * 63, 6);
		expect(occupied("full", many(80, 39))).toBeCloseTo(64, 6);
		expect(occupied("mini", many(40, 19))).toBeCloseTo(32, 6);
		expect(occupied("mini", many(40))).toBeCloseTo(32, 6);
		expect(ribbonSegments("mini", many(40))).toHaveLength(1);
	});

	test("a failed or canceled run keeps 1 px inside a crowded ribbon", () => {
		const checks = [...many(70), check("deploy", "cancel"), ...many(129)];
		const segments = ribbonSegments("full", checks);
		expect(segments.map((segment) => segment.bucket)).toEqual(["pass", "cancel", "pass"]);
		expect(segments[1]!.width).toBe(1);
		expect(occupied("full", checks)).toBeCloseTo(64, 6);
	});
});
