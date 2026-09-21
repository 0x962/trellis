import { expect, test } from "bun:test";
import { defaultReviewTab, reviewTabOf } from "./reviewTab";

test("a pull request that waits for the person opens on the diff", () => {
	expect(defaultReviewTab("you")).toBe("diff");
});

test("a pull request with an unknown turn opens on the diff", () => {
	expect(defaultReviewTab(null)).toBe("diff");
});

test("every other turn opens on the facts", () => {
	for (const turn of ["agent", "github", "ready", "waits on a merge", "done"] as const)
		expect(defaultReviewTab(turn)).toBe("facts");
});

test("the URL names a tab by its value, and any other value names none", () => {
	expect(reviewTabOf("facts")).toBe("facts");
	expect(reviewTabOf("diff")).toBe("diff");
	expect(reviewTabOf("Diff")).toBeUndefined();
	expect(reviewTabOf(undefined)).toBeUndefined();
	expect(reviewTabOf(1)).toBeUndefined();
});
