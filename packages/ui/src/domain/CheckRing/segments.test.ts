import { describe, expect, test } from "bun:test";
import { ringSegments } from "./segments";

describe("ringSegments", () => {
	test("omits an empty ring and zero-count states", () => {
		expect(ringSegments({})).toEqual([]);
		expect(ringSegments({ failed: 0, success: 3 })).toEqual([{ status: "success", count: 3, start: 0, length: 100 }]);
	});

	test("keeps one failure visible among hundreds of other checks", () => {
		const segments = ringSegments({ failed: 1, pending: 2, skipped: 101, success: 430 });
		expect(segments[0]?.status).toBe("failed");
		expect(segments[0]?.length).toBeGreaterThanOrEqual(2);
		expect(segments.reduce((sum, segment) => sum + segment.length + 5, 0)).toBeCloseTo(100);
		for (let index = 1; index < segments.length; index++) {
			const previous = segments[index - 1]!;
			expect(segments[index]!.start - previous.start - previous.length).toBeCloseTo(5);
		}
	});

	test("preserves proportional shares when each state has enough space", () => {
		const segments = ringSegments({ failed: 1, success: 3 });
		expect(segments.map((segment) => segment.length + 5)).toEqual([25, 75]);
	});

	test("fits every state into one ring without overlap", () => {
		const segments = ringSegments({
			failed: 1,
			running: 1,
			pending: 1,
			canceled: 1,
			unknown: 1,
			neutral: 1,
			skipped: 1,
			success: 10000,
		});
		expect(segments).toHaveLength(8);
		for (const segment of segments) expect(segment.length).toBeGreaterThanOrEqual(2);
		expect(segments.reduce((sum, segment) => sum + segment.length + 5, 0)).toBeCloseTo(100);
	});
});
