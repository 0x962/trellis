import { describe, expect, test } from "bun:test";
import { type Check, ribbonGap, ribbonSegments, ribbonWidths } from "./segments";

const many = (count: number, failAt = -1): Check[] =>
	Array.from({ length: count }, (_, index) => ({
		name: `check ${index + 1}`,
		bucket: index === failAt ? "fail" : "pass",
	}));

const total = (segments: ReadonlyArray<{ width: number }>) => segments.reduce((sum, segment) => sum + segment.width, 0);

describe("segments", () => {
	// The mobile copy draws the same ribbon as packages/ui: 32 px mini, 64 px
	// full, a run per bucket above one check per px, a failed run pinned at 1 px.
	test("merges runs above one check per px with the same widths as packages/ui", () => {
		expect(ribbonWidths).toEqual({ full: 64, mini: 32 });

		const mini = ribbonSegments("mini", many(40, 19));
		expect(mini.map((segment) => [segment.bucket, segment.title])).toEqual([
			["pass", "19 checks: pass"],
			["fail", "check 20: fail"],
			["pass", "20 checks: pass"],
		]);
		expect(mini[1]!.width).toBe(1);
		expect(total(mini)).toBeCloseTo(32, 6);

		const full = ribbonSegments("full", many(80, 19));
		expect(full).toHaveLength(3);
		expect(full[1]!.title).toBe("check 20: fail");
		expect(full[1]!.width).toBe(1);
		expect(total(full)).toBeCloseTo(64, 6);

		expect(ribbonGap("full", 16)).toBe(2);
		const sixteen = ribbonSegments("full", many(16));
		expect(sixteen).toHaveLength(16);
		expect(total(sixteen) + 15 * 2).toBeCloseTo(64, 6);
	});
});
