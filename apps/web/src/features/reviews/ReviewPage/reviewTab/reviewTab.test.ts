import { expect, test } from "bun:test";
import { defaultReviewTab, reviewTabOf } from "./reviewTab";

test("a pull request that waits for the person opens on the diff", () => {
	expect(defaultReviewTab("you")).toBe("diff");
});

test("a pull request with an unknown turn opens on the diff", () => {
	expect(defaultReviewTab(null)).toBe("diff");
});

test("every other turn opens on the overview", () => {
	for (const turn of ["agent", "github", "ready", "waits on a merge", "done"] as const)
		expect(defaultReviewTab(turn)).toBe("overview");
});

test("the URL names a tab by its value, and any other value names none", () => {
	expect(reviewTabOf("overview")).toBe("overview");
	expect(reviewTabOf("checks")).toBe("checks");
	expect(reviewTabOf("flows")).toBe("flows");
	expect(reviewTabOf("diff")).toBe("diff");
	expect(reviewTabOf("Diff")).toBeUndefined();
	expect(reviewTabOf(undefined)).toBeUndefined();
	expect(reviewTabOf(1)).toBeUndefined();
});

test("a link written before the four tabs opens the overview", () => {
	expect(reviewTabOf("facts")).toBe("overview");
});
