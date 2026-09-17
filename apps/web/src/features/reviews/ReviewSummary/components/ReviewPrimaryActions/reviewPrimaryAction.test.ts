import { describe, expect, test } from "bun:test";
import { mergeAction, primaryReviewAction } from "./reviewPrimaryAction";

describe("primaryReviewAction", () => {
	test("offers ready for review on an open draft", () => {
		expect(primaryReviewAction({ state: "OPEN", isDraft: true })).toBe("ready");
		expect(primaryReviewAction({ state: "open", isDraft: true })).toBe("ready");
	});

	test("offers merge on an open pull request", () => {
		expect(primaryReviewAction({ state: "OPEN", isDraft: false })).toBe("merge");
	});

	test("offers no primary action after the pull request closes", () => {
		expect(primaryReviewAction({ state: "MERGED", isDraft: false })).toBeNull();
		expect(primaryReviewAction({ state: "CLOSED", isDraft: false })).toBeNull();
	});
});

describe("mergeAction", () => {
	test("uses the administrator action only when selected", () => {
		expect(mergeAction(false)).toBe("merge");
		expect(mergeAction(true)).toBe("admin-merge");
	});
});
