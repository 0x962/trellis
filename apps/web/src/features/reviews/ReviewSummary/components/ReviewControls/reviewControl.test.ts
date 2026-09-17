import { describe, expect, test } from "bun:test";
import { mergeAction, namedReviewRequests, primaryReviewAction } from "./reviewControl";

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
	test("uses administrator privileges only when selected", () => {
		expect(mergeAction(false)).toBe("merge");
		expect(mergeAction(true)).toBe("admin-merge");
	});
});

describe("namedReviewRequests", () => {
	test("reads user and team review requests", () => {
		expect(namedReviewRequests([{ login: "ada" }, { slug: "platform" }, { name: "Release team" }, {}])).toEqual([
			{ name: "ada", kind: "user" },
			{ name: "platform", kind: "team" },
			{ name: "Release team", kind: "team" },
		]);
	});
});
