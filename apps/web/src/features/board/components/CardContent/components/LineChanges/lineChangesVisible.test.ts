import { describe, expect, test } from "bun:test";
import { lineChangesVisible } from "./lineChangesVisible";

describe("lineChangesVisible", () => {
	test("hides line counts until a count becomes nonzero", () => {
		expect(lineChangesVisible(undefined)).toBe(false);
		expect(lineChangesVisible(null)).toBe(false);
		expect(lineChangesVisible({ additions: 0, deletions: 0 })).toBe(false);
		expect(lineChangesVisible({ additions: 1, deletions: 0 })).toBe(true);
		expect(lineChangesVisible({ additions: 0, deletions: 1 })).toBe(true);
	});
});
