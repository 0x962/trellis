import { describe, expect, test } from "bun:test";
import { type Check, type RibbonSegment, ribbonGap, ribbonSegments, ribbonWidths, segmentWidth } from "./segments";

// The mobile ribbon runs the same arithmetic as the one in packages/ui, which
// mobile may not import. The suite is the same suite, so a defect that
// packages/ui catches never ships from here.

const check = (name: string, bucket: Check["bucket"]) => ({ name, bucket });
const many = (count: number, failAt = -1): Check[] =>
	Array.from({ length: count }, (_, index) => check(`check ${index + 1}`, index === failAt ? "fail" : "pass"));

// A test renders nothing, so the widths are computed here the way the ribbon
// draws them. The inputs are the box width, the gap, and the count.
const occupied = (size: "full" | "mini", checks: Check[]) => {
	const segments = ribbonSegments(size, checks);
	return (
		segments.reduce((sum, segment) => sum + segment.width, 0) + (segments.length - 1) * ribbonGap(size, checks.length)
	);
};

const total = (segments: ReadonlyArray<{ width: number }>) => segments.reduce((sum, segment) => sum + segment.width, 0);

const hundredths = (segments: readonly RibbonSegment[]) =>
	segments.reduce((sum, segment) => sum + Math.round(segment.width * 100), 0);

const isPinned = (segment: RibbonSegment) => segment.bucket === "fail" || segment.bucket === "cancel";

// The run length a segment stands for, read back from its tooltip.
const runLength = (segment: RibbonSegment) => Number(segment.title.match(/^(\d+) checks:/)?.[1] ?? 1);

// A mulberry32 generator, so a run of the suite repeats the same buckets.
const seededBucket = (seed: number) => {
	const buckets: Check["bucket"][] = ["pass", "fail", "cancel", "pending", "skipping"];
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let value = Math.imul(state ^ (state >>> 15), 1 | state);
		value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
		return buckets[((value ^ (value >>> 14)) >>> 0) % buckets.length]!;
	};
};

// A pinned run keeps 1 px while a free run still has width to give. When
// every free run is at 0 and a pinned run is under 1 px, the free runs
// could not pay. The exact shares must show that. Each share is rounded to
// whole hundredths, so a margin of two units per run covers the rounding.
const expectPinnedMinimum = (label: string, size: "full" | "mini", segments: readonly RibbonSegment[]) => {
	const count = segments.reduce((sum, segment) => sum + runLength(segment), 0);
	const pinned = segments.filter(isPinned);
	const free = segments.filter((segment) => !isPinned(segment));
	if (count <= ribbonWidths[size] || pinned.length === 0) return;
	if (free.some((segment) => segment.width > 0)) {
		for (const segment of pinned) expect(`${label} ${segment.width}`).toMatch(/ ([1-9]\d*(\.\d+)?)$/);
		return;
	}
	if (pinned.every((segment) => segment.width >= 1)) return;
	const share = (segment: RibbonSegment) => (runLength(segment) * ribbonWidths[size] * 100) / count;
	const need = pinned.reduce((sum, segment) => sum + Math.max(0, 100 - share(segment)), 0);
	const supply = free.reduce((sum, segment) => sum + share(segment), 0);
	expect(need).toBeGreaterThan(supply - 2 * segments.length);
};

// Two free runs of one length differ by at most 0.01 px.
const expectEqualFreeRuns = (label: string, segments: readonly RibbonSegment[]) => {
	const byLength = new Map<number, number[]>();
	for (const segment of segments) {
		if (isPinned(segment)) continue;
		const widths = byLength.get(runLength(segment)) ?? [];
		widths.push(Math.round(segment.width * 100));
		byLength.set(runLength(segment), widths);
	}
	for (const [length, widths] of byLength) {
		expect(`${label} length ${length} spread ${Math.max(...widths) - Math.min(...widths)}`).toMatch(/ spread [01]$/);
	}
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
		expect(segments[0]!.width).toBe(31.2);
		expect(segments[2]!.width).toBe(31.8);
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

	// A width is a px number with two decimals, so an inline style stays short.
	test("a run width is rounded to 0.01 px", () => {
		for (const segment of ribbonSegments("full", many(80, 39))) {
			expect(segment.width * 100).toBeCloseTo(Math.round(segment.width * 100), 6);
		}
	});

	// 80 checks, of which 79 fail and 1 is canceled. The pinned runs alone
	// exceed the box once the cancel run rises to 1 px. No free run can pay.
	// The pinned runs shrink in proportion, so the ribbon still fits.
	test("pinned runs that overfill the box shrink in proportion to fit it", () => {
		const checks = [...many(79).map((item) => check(item.name, "fail")), check("deploy", "cancel")];
		for (const size of ["full", "mini"] as const) {
			const segments = ribbonSegments(size, checks);
			expect(segments.map((segment) => segment.bucket)).toEqual(["fail", "cancel"]);
			expect(occupied(size, checks)).toBeCloseTo(ribbonWidths[size], 6);
			for (const segment of segments) expect(segment.width).toBeGreaterThan(0);
		}
	});

	// 40 fail/pass pairs in a mini ribbon: 40 pinned runs at 1 px is 40 px in
	// a 32 px box. The pass runs drop to 0 and the fail runs share the box.
	test("free runs drop to 0 and never below when the pinned runs need the whole box", () => {
		const checks = Array.from({ length: 80 }, (_, index) =>
			check(`check ${index + 1}`, index % 2 === 0 ? "fail" : "pass"),
		);
		const segments = ribbonSegments("mini", checks);
		expect(segments).toHaveLength(80);
		expect(occupied("mini", checks)).toBeCloseTo(32, 6);
		for (const segment of segments) {
			if (segment.bucket === "pass") expect(segment.width).toBe(0);
			else expect(segment.width).toBe(0.8);
		}
	});

	test("one failure among 80 passes keeps a 1 px fail segment in both sizes", () => {
		for (const size of ["full", "mini"] as const) {
			const segments = ribbonSegments(size, many(80, 0));
			expect(segments[0]!.bucket).toBe("fail");
			expect(segments[0]!.width).toBe(1);
			expect(segments[1]!.width).toBe(ribbonWidths[size] - 1);
			expect(occupied(size, many(80, 0))).toBeCloseTo(ribbonWidths[size], 6);
		}
	});

	test("6 checks in a full ribbon get equal widths that fill the box with the gaps", () => {
		const segments = ribbonSegments("full", many(6));
		expect(segments.map((segment) => segment.width)).toEqual([9, 9, 9, 9, 9, 9]);
		expect(occupied("full", many(6))).toBe(64);
	});

	// 7 checks in a full ribbon share 52 px, at 742 or 743 hundredths each.
	// The widths and the six 2 px gaps still add up to 64 px.
	test("a check width is a whole number of hundredths that adds up to the box", () => {
		const segments = ribbonSegments("full", many(7));
		expect(segments.map((segment) => segment.width).sort()).toEqual([7.42, 7.43, 7.43, 7.43, 7.43, 7.43, 7.43]);
		expect(hundredths(segments) + 6 * 2 * 100).toBe(6400);
	});

	// The widest free run pays each hundredth of a pinned rise, so three
	// equal free runs stay within 0.01 px of each other.
	test("the widest free run pays for a pinned rise", () => {
		const checks = [
			...many(20),
			check("deploy", "fail"),
			...many(20),
			check("lint", "fail"),
			...many(20),
			check("e2e", "cancel"),
		];
		const widths = ribbonSegments("mini", checks).map((segment) => segment.width);
		expect(widths).toEqual([9.66, 1, 9.67, 1, 9.67, 1]);
	});

	// Four families of check lists at every count up to 700, in both sizes.
	// The widths come back as whole hundredths that add up to the box with
	// the gaps. A pinned run keeps 1 px while a free run still has width to
	// give. Equal free runs stay within 0.01 px of each other.
	test("the widths keep the ribbon invariants at every count up to 700", () => {
		const families: Record<string, (index: number) => Check["bucket"]> = {
			"pass/pending": (index) => (index % 2 === 0 ? "pass" : "pending"),
			"fail/cancel": (index) => (index % 2 === 0 ? "fail" : "cancel"),
			"fail/pass": (index) => (index % 2 === 0 ? "fail" : "pass"),
			random: seededBucket(0x5eed),
		};
		for (const size of ["full", "mini"] as const) {
			for (const [family, bucketAt] of Object.entries(families)) {
				for (let count = 1; count <= 700; count += 1) {
					const checks = Array.from({ length: count }, (_, index) => check(`check ${index + 1}`, bucketAt(index)));
					const label = `${size} ${family} ${count}`;
					const segments = ribbonSegments(size, checks);
					for (const segment of segments) {
						expect(`${label} ${segment.width}`).not.toMatch(/ -/);
						expect(segment.width * 100).toBeCloseTo(Math.round(segment.width * 100), 6);
					}
					const gaps = (segments.length - 1) * ribbonGap(size, count) * 100;
					expect(`${label} ${hundredths(segments) + gaps}`).toBe(`${label} ${ribbonWidths[size] * 100}`);
					expectPinnedMinimum(label, size, segments);
					expectEqualFreeRuns(label, segments);
				}
			}
		}
	});

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
