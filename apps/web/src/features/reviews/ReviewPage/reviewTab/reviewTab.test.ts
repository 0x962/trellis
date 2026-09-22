import { expect, test } from "bun:test";
import { defaultReviewTab, initialReviewTab, reviewTabOf } from "./reviewTab";

test("a review with no URL tab and no session tab opens on the overview", () => {
	expect(defaultReviewTab).toBe("overview");
	expect(initialReviewTab(undefined, null)).toBe("overview");
});

test("the URL tab wins over the session tab", () => {
	expect(initialReviewTab("checks", "diff")).toBe("checks");
});

test("the session tab wins when the URL names none", () => {
	expect(initialReviewTab(undefined, "diff")).toBe("diff");
});

test("the chosen tab stays when turn data arrives after the first render", () => {
	const chosen = initialReviewTab(undefined, "diff");
	const afterTurnDataArrives = initialReviewTab(undefined, chosen);

	expect(afterTurnDataArrives).toBe("diff");
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
